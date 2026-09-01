"""
download/downloader.py
======================

MediaVault - Download Engine

Responsabilidades:
- Downloads HTTP/HTTPS diretos.
- Downloads através do yt-dlp.
- Suporte a vídeo e MP3.
- Fila sequencial de downloads.
- Cancelamento.
- Suporte a lotes.
- Limite máximo de tamanho.
- Proteção contra arquivos parciais.
- Validação de Content-Length.
- Detecção de downloads truncados.
- Finalização atômica de arquivos.
- Controle de colisão de nomes.
- Atualização de progresso através de callback.
"""

from __future__ import annotations

import os
import queue
import re
import shutil
import tempfile
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

import requests
from requests import Response

try:
    import yt_dlp
except ImportError:
    yt_dlp = None


# ============================================================================
# CONFIGURAÇÕES
# ============================================================================

EXTENSOES_DIRETAS = frozenset(
    {
        ".mp4", ".mp3", ".jpg", ".jpeg", ".png", ".webp", ".pdf", ".docx",
        ".txt", ".gif", ".mkv", ".wav", ".flac", ".avi", ".mov", ".webm",
        ".m4a", ".ogg", ".opus",
    }
)

REGEX_YOUTUBE = re.compile(r"(?:youtube\.com|youtu\.be)", re.IGNORECASE)

MAX_DOWNLOAD_SIZE_BYTES = 5 * 1024 * 1024 * 1024  # 5 GiB
HTTP_CHUNK_SIZE = 64 * 1024  # 64 KiB
HTTP_TIMEOUT = (10, 30)
MAX_FILENAME_LENGTH = 180

NOMES_RESERVADOS_WINDOWS = frozenset(
    {
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    }
)


# ============================================================================
# EXCEÇÕES
# ============================================================================


class DownloadError(Exception):
    """Erro base das operações de download."""


class DownloadCancelled(DownloadError):
    """Download cancelado pelo usuário."""


class DownloadSizeError(DownloadError):
    """Arquivo excede o limite máximo permitido."""


class DownloadIntegrityError(DownloadError):
    """Download recebido está incompleto ou inconsistente."""


# ============================================================================
# FUNÇÕES AUXILIARES
# ============================================================================


def detectar_tipo(url: str) -> str:
    """Identifica o método de download adequado para uma URL."""
    url_normalizada = str(url).strip().lower()

    if REGEX_YOUTUBE.search(url_normalizada):
        return "YouTube"

    caminho = url_normalizada.split("?", 1)[0].split("#", 1)[0]

    if any(caminho.endswith(ext) for ext in EXTENSOES_DIRETAS):
        return "Download direto"

    return "Outro (via yt-dlp)"


def sanitizar_nome_arquivo(nome: str) -> str:
    """Sanitiza um nome de arquivo para uso no Windows."""
    nome = os.path.basename(str(nome).strip())
    nome = re.sub(r'[\\/*?:"<>|]', "_", nome)
    nome = "".join(c for c in nome if ord(c) >= 32)
    nome = nome.rstrip(" .")

    if not nome:
        return "arquivo_baixado"

    caminho = Path(nome)
    stem = caminho.stem
    suffix = caminho.suffix

    if stem.upper() in NOMES_RESERVADOS_WINDOWS:
        stem = f"_{stem}"

    max_stem = max(1, MAX_FILENAME_LENGTH - len(suffix))
    if len(stem) > max_stem:
        stem = stem[:max_stem].rstrip(" .")

    nome_final = f"{stem}{suffix}"
    return nome_final or "arquivo_baixado"


def _formatar_velocidade(bytes_por_segundo: Optional[float]) -> str:
    if not bytes_por_segundo:
        return "-"
    return f"{bytes_por_segundo / 1024 / 1024:.2f} MB/s"


def _formatar_eta(segundos: Optional[float]) -> str:
    if segundos is None:
        return "-"
    segundos = max(0, int(segundos))
    minutos, segundos_restantes = divmod(segundos, 60)
    if minutos:
        return f"{minutos}m{segundos_restantes:02d}s"
    return f"{segundos_restantes}s"


def _nome_disponivel(pasta: Path, nome: str) -> Path:
    """Retorna um caminho que não sobrescreve arquivo existente."""
    pasta = Path(pasta)
    candidato = pasta / nome

    if not candidato.exists():
        return candidato

    stem = candidato.stem
    suffix = candidato.suffix
    contador = 1

    while True:
        candidato = pasta / f"{stem} ({contador}){suffix}"
        if not candidato.exists():
            return candidato
        contador += 1


# ============================================================================
# MODELO DO DOWNLOAD
# ============================================================================


@dataclass
class DownloadItem:
    """Representa um item individual da fila."""

    url: str
    tipo: str = ""
    formato: str = "video"
    status: str = "Na fila"
    progresso: float = 0.0
    velocidade: str = ""
    tamanho: str = ""
    tempo_restante: str = ""
    arquivo_final: Optional[Path] = None
    erro: str = ""
    cancelar: bool = field(default=False, repr=False)

    # Lote
    batch_id: str = ""
    batch_name: str = ""
    indice_lote: int = 0
    total_lote: int = 0

    def __post_init__(self) -> None:
        self.url = str(self.url).strip()

        if not self.url:
            raise ValueError("URL de download não pode estar vazia.")

        if not self.tipo:
            self.tipo = detectar_tipo(self.url)

        if self.formato not in {"video", "mp3"}:
            raise ValueError("Formato de download inválido. Use 'video' ou 'mp3'.")

        if self.indice_lote < 0:
            raise ValueError("indice_lote não pode ser negativo.")

        if self.total_lote < 0:
            raise ValueError("total_lote não pode ser negativo.")

        if self.total_lote and self.indice_lote > self.total_lote:
            raise ValueError("indice_lote não pode ser maior que total_lote.")


# ============================================================================
# DOWNLOADER
# ============================================================================


class Downloader:
    """Gerenciador sequencial de downloads (uma thread processa a fila)."""

    def __init__(self, pasta_destino: Path, on_update: Callable[[DownloadItem], None]):
        self.pasta_destino = Path(pasta_destino).resolve()
        self.pasta_destino.mkdir(parents=True, exist_ok=True)

        self.on_update = on_update
        self._fila: "queue.Queue[DownloadItem]" = queue.Queue()
        self._thread: Optional[threading.Thread] = None
        self._rodando = False
        self._lock = threading.Lock()
        self._shutdown = False

    # --------------------------------------------------------------------
    # FILA
    # --------------------------------------------------------------------

    def adicionar(self, item: DownloadItem) -> None:
        if self._shutdown:
            raise RuntimeError("Downloader encerrado.")

        if not isinstance(item, DownloadItem):
            raise TypeError("item deve ser uma instância de DownloadItem.")

        with self._lock:
            self._fila.put(item)

            if self._rodando:
                return

            self._rodando = True
            self._thread = threading.Thread(
                target=self._processar_fila,
                name="BibliotecaMidia-Downloader",
                daemon=True,
            )
            self._thread.start()

    def cancelar_todos(self) -> int:
        quantidade = 0
        with self._lock:
            for item in list(self._fila.queue):
                if not item.cancelar:
                    item.cancelar = True
                    quantidade += 1
        return quantidade

    def aguardar(self, timeout: Optional[float] = None) -> bool:
        thread = self._thread
        if thread is None:
            return True
        if thread is threading.current_thread():
            return True
        thread.join(timeout)
        return not thread.is_alive()

    def encerrar(self, timeout: float = 2.0) -> bool:
        self._shutdown = True
        self.cancelar_todos()
        return self.aguardar(timeout)

    # --------------------------------------------------------------------
    # CALLBACK
    # --------------------------------------------------------------------

    def _notificar(self, item: DownloadItem) -> None:
        try:
            self.on_update(item)
        except Exception:
            return

    # --------------------------------------------------------------------
    # WORKER
    # --------------------------------------------------------------------

    def _processar_fila(self) -> None:
        try:
            while True:
                try:
                    item = self._fila.get_nowait()
                except queue.Empty:
                    with self._lock:
                        if not self._fila.empty():
                            continue
                        self._rodando = False
                        return

                try:
                    if item.cancelar:
                        self._marcar_cancelado(item)
                    else:
                        self._baixar_item(item)
                except DownloadCancelled:
                    self._marcar_cancelado(item)
                except Exception as erro:
                    if item.cancelar:
                        self._marcar_cancelado(item)
                    else:
                        item.status = "Erro"
                        item.erro = str(erro)
                        self._notificar(item)
                finally:
                    self._fila.task_done()
        finally:
            with self._lock:
                self._rodando = False

    # --------------------------------------------------------------------
    # ESTADOS
    # --------------------------------------------------------------------

    def _marcar_cancelado(self, item: DownloadItem) -> None:
        item.cancelar = True
        item.status = "Cancelado"
        item.erro = ""
        self._notificar(item)

    def _baixar_item(self, item: DownloadItem) -> None:
        item.status = "Baixando"
        item.erro = ""
        self._notificar(item)

        if item.tipo == "Download direto":
            self._baixar_direto(item)
        else:
            self._baixar_com_ytdlp(item)

        if item.cancelar:
            self._marcar_cancelado(item)
            return

        if item.arquivo_final is None:
            raise DownloadError("O download terminou sem produzir um arquivo final válido.")

        if not item.arquivo_final.exists():
            raise DownloadError("O arquivo final informado não existe.")

        item.status = "Concluído"
        item.progresso = 100.0
        self._notificar(item)

    # --------------------------------------------------------------------
    # DOWNLOAD HTTP
    # --------------------------------------------------------------------

    def _baixar_direto(self, item: DownloadItem) -> None:
        resposta: Optional[Response] = None
        arquivo_temporario: Optional[Path] = None

        try:
            resposta = requests.get(
                item.url, stream=True, timeout=HTTP_TIMEOUT, allow_redirects=True
            )
            resposta.raise_for_status()

            nome_bruto = item.url.split("?", 1)[0].split("#", 1)[0].rstrip("/").split("/")[-1]
            nome_seguro = sanitizar_nome_arquivo(nome_bruto)
            destino_final = _nome_disponivel(self.pasta_destino, nome_seguro)

            content_length = resposta.headers.get("Content-Length")
            total = 0
            if content_length:
                try:
                    total = int(content_length)
                except (TypeError, ValueError):
                    total = 0

            if total > MAX_DOWNLOAD_SIZE_BYTES:
                raise DownloadSizeError("O arquivo excede o limite máximo de 5 GB.")

            with tempfile.NamedTemporaryFile(
                mode="wb", prefix=".bibliotecamidia-", suffix=".part",
                dir=self.pasta_destino, delete=False,
            ) as temporario:
                arquivo_temporario = Path(temporario.name)
                baixado = 0

                for chunk in resposta.iter_content(chunk_size=HTTP_CHUNK_SIZE):
                    if item.cancelar:
                        raise DownloadCancelled("Download cancelado pelo usuário.")
                    if not chunk:
                        continue

                    baixado += len(chunk)
                    if baixado > MAX_DOWNLOAD_SIZE_BYTES:
                        raise DownloadSizeError("O arquivo excede o limite máximo de 5 GB.")

                    temporario.write(chunk)

                    if total > 0:
                        item.progresso = min(100.0, round(baixado / total * 100, 1))
                        item.tamanho = f"{baixado / 1024 / 1024:.1f} / {total / 1024 / 1024:.1f} MB"
                    else:
                        item.tamanho = f"{baixado / 1024 / 1024:.1f} MB"

                    self._notificar(item)

                temporario.flush()

                if total > 0 and baixado != total:
                    raise DownloadIntegrityError(
                        "O download foi interrompido antes de atingir o tamanho informado pelo servidor."
                    )

            if item.cancelar:
                raise DownloadCancelled("Download cancelado pelo usuário.")

            os.replace(arquivo_temporario, destino_final)
            arquivo_temporario = None
            item.arquivo_final = destino_final

        finally:
            if resposta is not None:
                resposta.close()
            if arquivo_temporario is not None:
                arquivo_temporario.unlink(missing_ok=True)

    # --------------------------------------------------------------------
    # DOWNLOAD YT-DLP
    # --------------------------------------------------------------------

    def _baixar_com_ytdlp(self, item: DownloadItem) -> None:
        if yt_dlp is None:
            raise RuntimeError("yt-dlp não está instalado no ambiente virtual.")

        if item.formato == "mp3" and shutil.which("ffmpeg") is None:
            raise RuntimeError("FFmpeg não foi encontrado. Ele é necessário para converter áudio para MP3.")

        tamanho_excedido = False

        def hook(d: dict) -> None:
            nonlocal tamanho_excedido

            if item.cancelar:
                raise yt_dlp.utils.DownloadError("Cancelado pelo usuário.")

            status = d.get("status")
            if status not in {"downloading", "finished"}:
                return

            total = (
                d.get("total_bytes")
                or d.get("total_bytes_estimate")
                or d.get("filesize")
                or d.get("filesize_approx")
                or 0
            )
            baixado = d.get("downloaded_bytes", 0)

            if total > MAX_DOWNLOAD_SIZE_BYTES:
                tamanho_excedido = True
                raise yt_dlp.utils.DownloadError("Arquivo excede o limite do MediaVault.")

            if baixado > MAX_DOWNLOAD_SIZE_BYTES:
                tamanho_excedido = True
                raise yt_dlp.utils.DownloadError("Arquivo excede o limite do MediaVault.")

            if total:
                item.progresso = min(100.0, round(baixado / total * 100, 1))

            item.velocidade = _formatar_velocidade(d.get("speed"))
            item.tempo_restante = _formatar_eta(d.get("eta"))
            item.tamanho = f"{baixado / 1024 / 1024:.1f} MB"

            self._notificar(item)

        with tempfile.TemporaryDirectory(
            dir=self.pasta_destino, prefix=".bibliotecamidia-ytdlp-"
        ) as temporary_directory:
            temporary_path = Path(temporary_directory)

            opcoes = {
                "outtmpl": str(temporary_path / "%(title)s.%(ext)s"),
                "progress_hooks": [hook],
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
                "windowsfilenames": True,
                "overwrites": False,
                "max_filesize": MAX_DOWNLOAD_SIZE_BYTES,
            }

            if item.formato == "mp3":
                opcoes["format"] = "bestaudio/best"
                opcoes["postprocessors"] = [
                    {
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": "192",
                    }
                ]
            else:
                opcoes["format"] = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"

            try:
                with yt_dlp.YoutubeDL(opcoes) as ydl:
                    info = ydl.extract_info(item.url, download=True)
            except Exception as error:
                if tamanho_excedido:
                    raise DownloadSizeError("O arquivo excede o limite máximo de 5 GB.") from error
                if item.cancelar:
                    raise DownloadCancelled("Download cancelado pelo usuário.") from error
                raise

            if item.cancelar:
                raise DownloadCancelled("Download cancelado pelo usuário.")

            if not info:
                raise DownloadError("yt-dlp não retornou informações sobre o arquivo.")

            caminho: Optional[str] = info.get("filepath")
            if not caminho:
                caminho = info.get("_filename")

            if not caminho:
                requested_downloads = info.get("requested_downloads") or []
                for requested in requested_downloads:
                    filepath = requested.get("filepath")
                    if not filepath:
                        continue
                    caminho = filepath
                    if Path(filepath).exists():
                        break

            if not caminho:
                caminho = ydl.prepare_filename(info)

            caminho_final = Path(caminho)

            if item.formato == "mp3":
                caminho_mp3 = caminho_final.with_suffix(".mp3")
                if caminho_mp3.exists():
                    caminho_final = caminho_mp3

            if not caminho_final.exists():
                candidatos = [
                    path for path in temporary_path.rglob("*")
                    if path.is_file() and not path.name.endswith(".part")
                ]
                if len(candidatos) == 1:
                    caminho_final = candidatos[0]
                else:
                    raise DownloadError("yt-dlp informou um arquivo final que não foi encontrado.")

            if caminho_final.stat().st_size > MAX_DOWNLOAD_SIZE_BYTES:
                raise DownloadSizeError("O arquivo excede o limite máximo de 5 GB.")

            nome_seguro = sanitizar_nome_arquivo(caminho_final.name)
            destino_final = _nome_disponivel(self.pasta_destino, nome_seguro)

            if item.cancelar:
                raise DownloadCancelled("Download cancelado pelo usuário.")

            os.replace(caminho_final, destino_final)
            item.arquivo_final = destino_final


# ============================================================================
# FIM
# ============================================================================
