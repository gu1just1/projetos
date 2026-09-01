from __future__ import annotations

"""Biblioteca de Mídia — interface desktop clássica para Windows.

Arquitetura:
    downloader worker -> fila de eventos -> mainloop Tkinter
    storage worker   -> fila de eventos -> mainloop Tkinter

Princípios:
    - nenhuma thread de trabalho manipula widgets Tkinter;
    - estados internos da interface são canônicos em inglês;
    - valores legados em português continuam aceitos;
    - páginas podem ser reconstruídas sem quebrar callbacks pendentes;
    - timers e executores são cancelados/encerrados de forma controlada;
    - destino de armazenamento é explícito e nunca abre diálogo sozinho
      durante um callback de conclusão.
"""

import json
import logging
import os
import queue
import sys
import threading
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Tcl/Tk bootstrap: configure antes de importar tkinter.
# Isso reduz dependência da descoberta automática do Python em virtualenvs.
# ---------------------------------------------------------------------------

def _configure_tk_environment() -> None:
    try:
        python_home = Path(sys.base_prefix).resolve()
        tcl_candidates = sorted(python_home.glob("tcl/tcl8.*"))
        tk_candidates = sorted(python_home.glob("tcl/tk8.*"))
        if tcl_candidates and "TCL_LIBRARY" not in os.environ:
            os.environ["TCL_LIBRARY"] = str(tcl_candidates[-1])
        if tk_candidates and "TK_LIBRARY" not in os.environ:
            os.environ["TK_LIBRARY"] = str(tk_candidates[-1])
    except Exception:
        pass


_configure_tk_environment()

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from config import carregar_config_usuario, salvar_config_usuario
from download.downloader import DownloadItem, Downloader
from storage.pendrive import abrir_pasta, listar_pendrives
from utils.organizer import organizar_e_copiar


# ============================================================================
# IDENTIDADE / CAMINHOS
# ============================================================================

APP_NAME = "Biblioteca de Mídia"
APP_SUBTITLE = "Ferramenta de Gerenciamento"
APP_VERSION = "2.1"
APP_TITLE = f"{APP_NAME} — {APP_SUBTITLE}"

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
LOG_DIR = DATA_DIR / "logs"
HISTORY_FILE = DATA_DIR / "history.json"
APP_LOG_FILE = LOG_DIR / "biblioteca_midia.log"

DOWNLOAD_DIR = Path.home() / "BibliotecaMidia" / "downloads"

for _directory in (DATA_DIR, LOG_DIR, DOWNLOAD_DIR):
    try:
        _directory.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass


# ============================================================================
# APARÊNCIA CLÁSSICA WINDOWS
# ============================================================================

COR_FUNDO = "#F3F3F3"
COR_PAINEL = "#FFFFFF"
COR_PAINEL_ALT = "#FAFAFA"
COR_BORDA = "#D1D1D1"
COR_BORDA_ESCURA = "#AFAFAF"
COR_TEXTO = "#1F1F1F"
COR_TEXTO_SECUNDARIO = "#606060"
COR_TEXTO_DESABILITADO = "#888888"
COR_ACENTO = "#0067C0"
COR_ACENTO_ESCURA = "#005A9E"
COR_ACENTO_CLARO = "#E5F1FB"
COR_SUCESSO = "#107C10"
COR_AVISO = "#9D5D00"
COR_ERRO = "#C42B1C"
COR_CONSOLE = "#111111"
COR_CONSOLE_CABECALHO = "#181818"
COR_CONSOLE_TEXTO = "#D8D8D8"
COR_STATUS = "#EBEBEB"


# ============================================================================
# ESTADOS CANÔNICOS DA UI
# ============================================================================

STATUS_QUEUED = "Queued"
STATUS_DOWNLOADING = "Downloading"
STATUS_COMPLETED = "Completed"
STATUS_ERROR = "Error"
STATUS_CANCELLED = "Cancelled"

FINISHED_STATUSES = {
    STATUS_COMPLETED,
    STATUS_ERROR,
    STATUS_CANCELLED,
}

PAGE_DOWNLOADS = "downloads"
PAGE_QUEUE = "queue"
PAGE_STORAGE = "storage"
PAGE_HISTORY = "history"
PAGE_SYSTEM = "system"

MAX_URLS_BATCH = 100
MAX_LOG_LINES = 500
MAX_HISTORY = 1000
UI_POLL_MS = 50
DRIVE_REFRESH_MS = 5000
STORAGE_WORKERS = 2


# ============================================================================
# LOGGING
# ============================================================================

logger = logging.getLogger("bibliotecamidia.gui")
if not logger.handlers:
    logger.setLevel(logging.INFO)
    try:
        handler = logging.FileHandler(
            APP_LOG_FILE,
            encoding="utf-8",
            delay=True,
        )
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s | %(levelname)s | %(threadName)s | %(message)s"
            )
        )
        logger.addHandler(handler)
    except OSError:
        pass


# ============================================================================
# EVENTOS
# ============================================================================

class _UIEvent:
    __slots__ = ("kind", "payload")

    def __init__(self, kind: str, payload: dict[str, Any]) -> None:
        self.kind = kind
        self.payload = payload


# ============================================================================
# HELPERS DE DOMÍNIO
# ============================================================================

def _canonical_status(value: Any) -> str:
    raw = str(getattr(value, "value", value)).strip()
    normalized = raw.casefold()

    if normalized in {"na fila", "queued", "queue", "aguardando"}:
        return STATUS_QUEUED
    if normalized in {"baixando", "downloading", "download", "active"}:
        return STATUS_DOWNLOADING
    if normalized in {
        "concluído",
        "concluido",
        "completed",
        "complete",
        "finished",
        "success",
        "sucesso",
    }:
        return STATUS_COMPLETED
    if normalized in {
        "erro",
        "error",
        "failed",
        "failure",
    }:
        return STATUS_ERROR
    if normalized in {
        "cancelado",
        "cancelada",
        "cancelled",
        "canceled",
        "cancel",
    }:
        return STATUS_CANCELLED

    return raw


def _status_text(value: Any) -> str:
    """Compatibility alias used by legacy parts of the interface."""
    return _canonical_status(value)


def _item_url(item: DownloadItem) -> str:
    return str(getattr(item, "url", ""))


def _item_type(item: DownloadItem) -> str:
    return str(getattr(item, "tipo", ""))


def _item_output(item: Optional[DownloadItem]) -> Optional[Path]:
    if item is None:
        return None
    value = getattr(item, "arquivo_final", None)
    if not value:
        return None
    try:
        return Path(value)
    except (TypeError, ValueError):
        return None


def _validar_url(url: str) -> bool:
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return False
    return parsed.scheme.casefold() in {"http", "https"} and bool(parsed.netloc)


def _agora() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


# ============================================================================
# APP
# ============================================================================

class App(tk.Tk):
    """Janela principal da aplicação."""

    def __init__(self) -> None:
        super().__init__()

        self.title(APP_TITLE)
        self.geometry("1280x800")
        self.minsize(1050, 680)
        self.configure(bg=COR_FUNDO)

        self._ui_thread_id = threading.get_ident()
        self._closing = False
        self._shutdown_started = False

        # Estado de dados.
        self._items: dict[str, DownloadItem] = {}
        self._row_names: dict[str, str] = {}
        self._created_at: dict[str, str] = {}
        self._storage_status: dict[str, str] = {}
        self._storage_paths: dict[str, str] = {}
        self._completion_handled: set[str] = set()
        self._organizing_items: set[str] = set()
        self._history: list[dict[str, Any]] = []
        self._log_entries: list[tuple[str, str]] = []

        # Estado de UI/infraestrutura.
        self._event_queue: queue.Queue[_UIEvent] = queue.Queue()
        self._storage_executor = ThreadPoolExecutor(
            max_workers=STORAGE_WORKERS,
            thread_name_prefix="BibliotecaMidia-Storage",
        )
        self._storage_futures: set[Future[Any]] = set()
        self._storage_future_item: dict[Future[Any], str] = {}
        self._future_lock = threading.Lock()

        self.pendrives: list[Any] = []
        self._selected_destination: Optional[Path] = None
        self._selected_row: Optional[str] = None
        self._current_page = PAGE_DOWNLOADS
        self._username = "local"

        self._initialise_after_id: Optional[str] = None
        self._drive_refresh_after_id: Optional[str] = None
        self._poll_event_after_id: Optional[str] = None

        self._downloader = Downloader(
            pasta_destino=DOWNLOAD_DIR,
            on_update=self._on_download_update,
        )
        self._download_dir = Path(self._downloader.pasta_destino)
        self._download_dir.mkdir(parents=True, exist_ok=True)

        self._configure_style()
        self._create_menu()
        self._create_layout()
        self._load_user_config()
        self._load_history()
        self._refresh_drives()
        self._bind_shortcuts()

        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self._initialise_after_id = self.after(
            100,
            self._initialise_application,
        )
        self._poll_event_after_id = self.after(
            UI_POLL_MS,
            self._poll_event_queue,
        )
        self._schedule_drive_refresh()

    # ========================================================================
    # THREAD / EVENT QUEUE
    # ========================================================================

    def _assert_ui_thread(self) -> None:
        if threading.get_ident() != self._ui_thread_id:
            raise RuntimeError(
                "Operação de interface fora da thread principal."
            )

    def _post_event(self, kind: str, **payload: Any) -> None:
        if self._closing:
            return
        self._event_queue.put(_UIEvent(kind, payload))

    def _poll_event_queue(self) -> None:
        if self._closing:
            return

        self._assert_ui_thread()
        processed = 0

        while processed < 200:
            try:
                event = self._event_queue.get_nowait()
            except queue.Empty:
                break

            processed += 1
            try:
                self._dispatch_event(event)
            except Exception:
                logger.exception(
                    "Falha ao processar evento %s",
                    event.kind,
                )

        if self._closing:
            return

        try:
            self._poll_event_after_id = self.after(
                UI_POLL_MS,
                self._poll_event_queue,
            )
        except tk.TclError:
            self._poll_event_after_id = None

    def _dispatch_event(self, event: _UIEvent) -> None:
        payload = event.payload

        if event.kind == "download":
            self._apply_download_update(payload["item"])
        elif event.kind == "storage_ok":
            self._storage_copy_succeeded(
                payload["row_id"],
                payload["result"],
                payload.get("future"),
            )
        elif event.kind == "storage_error":
            self._storage_copy_failed(
                payload["row_id"],
                payload["error"],
                payload.get("future"),
            )

    # ========================================================================
    # STYLE
    # ========================================================================

    def _configure_style(self) -> None:
        style = ttk.Style(self)

        for theme in ("vista", "xpnative", "clam"):
            try:
                style.theme_use(theme)
                break
            except tk.TclError:
                continue

        style.configure(
            "Treeview",
            background=COR_PAINEL,
            fieldbackground=COR_PAINEL,
            foreground=COR_TEXTO,
            rowheight=25,
            font=("Segoe UI", 9),
            borderwidth=0,
        )
        style.configure(
            "Treeview.Heading",
            background="#EBEBEB",
            foreground=COR_TEXTO,
            font=("Segoe UI Semibold", 9),
            relief="flat",
        )
        style.map(
            "Treeview",
            background=[("selected", COR_ACENTO_CLARO)],
            foreground=[("selected", COR_TEXTO)],
        )
        style.configure(
            "TButton",
            font=("Segoe UI", 9),
            padding=(9, 4),
        )
        style.configure(
            "TCombobox",
            font=("Segoe UI", 9),
            padding=3,
        )

    # ========================================================================
    # MENU
    # ========================================================================

    def _create_menu(self) -> None:
        menu = tk.Menu(self, tearoff=False)

        arquivo = tk.Menu(menu, tearoff=False)
        arquivo.add_command(
            label="Adicionar downloads",
            accelerator="Ctrl+Enter",
            command=self._focus_download_input,
        )
        arquivo.add_command(
            label="Abrir diretório de downloads",
            command=self._open_download_directory,
        )
        arquivo.add_separator()
        arquivo.add_command(
            label="Salvar configuração",
            command=self._save_user_config,
        )
        arquivo.add_separator()
        arquivo.add_command(label="Sair", command=self._on_close)

        acao = tk.Menu(menu, tearoff=False)
        acao.add_command(
            label="Cancelar selecionado",
            accelerator="Delete",
            command=self._cancel_selected,
        )
        acao.add_command(
            label="Limpar concluídos",
            command=self._clear_completed,
        )
        acao.add_separator()
        acao.add_command(
            label="Atualizar dispositivos",
            accelerator="F5",
            command=self._refresh_drives,
        )

        exibir = tk.Menu(menu, tearoff=False)
        exibir.add_command(
            label="Downloads",
            command=lambda: self._select_navigation(PAGE_DOWNLOADS),
        )
        exibir.add_command(
            label="Fila de downloads",
            command=lambda: self._select_navigation(PAGE_QUEUE),
        )
        exibir.add_command(
            label="Armazenamento",
            command=lambda: self._select_navigation(PAGE_STORAGE),
        )
        exibir.add_command(
            label="Histórico",
            command=lambda: self._select_navigation(PAGE_HISTORY),
        )
        exibir.add_command(
            label="Sistema",
            command=lambda: self._select_navigation(PAGE_SYSTEM),
        )
        exibir.add_separator()
        exibir.add_command(
            label="Limpar log",
            accelerator="Ctrl+L",
            command=self._clear_log,
        )

        ferramentas = tk.Menu(menu, tearoff=False)
        ferramentas.add_command(
            label="Atualizar dispositivos removíveis",
            command=self._refresh_drives,
        )
        ferramentas.add_command(
            label="Selecionar pasta de destino...",
            command=self._select_custom_destination,
        )
        ferramentas.add_command(
            label="Abrir pasta de downloads",
            command=self._open_download_directory,
        )

        ajuda = tk.Menu(menu, tearoff=False)
        ajuda.add_command(label="Sobre", command=self._show_about)

        menu.add_cascade(label="Arquivo", menu=arquivo)
        menu.add_cascade(label="Ação", menu=acao)
        menu.add_cascade(label="Exibir", menu=exibir)
        menu.add_cascade(label="Ferramentas", menu=ferramentas)
        menu.add_cascade(label="Ajuda", menu=ajuda)
        self.configure(menu=menu)

    # ========================================================================
    # LAYOUT
    # ========================================================================

    def _create_layout(self) -> None:
        self._create_header()
        self._create_toolbar()
        self._create_main_area()
        self._create_status_bar()

    def _create_header(self) -> None:
        header = tk.Frame(
            self,
            bg=COR_PAINEL,
            height=58,
            highlightbackground=COR_BORDA,
            highlightthickness=1,
        )
        header.pack(fill="x")
        header.pack_propagate(False)

        logo = tk.Canvas(
            header,
            width=38,
            height=38,
            bg=COR_PAINEL,
            highlightthickness=0,
        )
        logo.pack(side="left", padx=(12, 7), pady=9)
        logo.create_rectangle(5, 5, 33, 33, outline=COR_ACENTO, width=2)
        logo.create_line(10, 12, 27, 12, fill=COR_ACENTO, width=2)
        logo.create_line(10, 18, 27, 18, fill=COR_ACENTO, width=2)
        logo.create_line(10, 24, 21, 24, fill=COR_ACENTO, width=2)
        logo.create_line(24, 25, 27, 28, fill=COR_SUCESSO, width=2)
        logo.create_line(27, 28, 31, 20, fill=COR_SUCESSO, width=2)

        identity = tk.Frame(header, bg=COR_PAINEL)
        identity.pack(side="left", fill="y")
        tk.Label(
            identity,
            text=APP_NAME,
            bg=COR_PAINEL,
            fg=COR_TEXTO,
            font=("Segoe UI Semibold", 13),
        ).pack(anchor="w", pady=(7, 0))
        tk.Label(
            identity,
            text="Gerenciamento e organização de mídia",
            bg=COR_PAINEL,
            fg=COR_TEXTO_SECUNDARIO,
            font=("Segoe UI", 8),
        ).pack(anchor="w")

        self.lbl_header_state = tk.Label(
            header,
            text="Pronto",
            bg=COR_PAINEL,
            fg=COR_TEXTO_SECUNDARIO,
            font=("Segoe UI", 8),
        )
        self.lbl_header_state.pack(side="right", padx=14)

    def _create_toolbar(self) -> None:
        toolbar = tk.Frame(
            self,
            bg=COR_PAINEL_ALT,
            highlightbackground=COR_BORDA,
            highlightthickness=1,
        )
        toolbar.pack(fill="x")

        ttk.Button(
            toolbar,
            text="Adicionar",
            command=self._focus_download_input,
        ).pack(side="left", padx=(8, 3), pady=5)
        ttk.Button(
            toolbar,
            text="Cancelar",
            command=self._cancel_selected,
        ).pack(side="left", padx=3, pady=5)
        ttk.Button(
            toolbar,
            text="Remover concluídos",
            command=self._clear_completed,
        ).pack(side="left", padx=3, pady=5)

        ttk.Separator(toolbar, orient="vertical").pack(
            side="left",
            fill="y",
            padx=8,
            pady=4,
        )

        ttk.Button(
            toolbar,
            text="Atualizar",
            command=self._refresh_drives,
        ).pack(side="left", padx=3, pady=5)
        ttk.Button(
            toolbar,
            text="Abrir",
            command=self._open_selected_or_destination,
        ).pack(side="left", padx=3, pady=5)

        self.lbl_toolbar_target = tk.Label(
            toolbar,
            text="Destino: Downloads locais",
            bg=COR_PAINEL_ALT,
            fg=COR_TEXTO_SECUNDARIO,
            font=("Segoe UI", 8),
        )
        self.lbl_toolbar_target.pack(side="right", padx=10)

    def _create_main_area(self) -> None:
        container = tk.Frame(self, bg=COR_FUNDO)
        container.pack(fill="both", expand=True)

        self.navigation_frame = tk.Frame(
            container,
            width=200,
            bg=COR_PAINEL,
            highlightbackground=COR_BORDA,
            highlightthickness=1,
        )
        self.navigation_frame.pack(side="left", fill="y")
        self.navigation_frame.pack_propagate(False)

        self._create_navigation(self.navigation_frame)

        self.content_frame = tk.Frame(container, bg=COR_FUNDO)
        self.content_frame.pack(side="left", fill="both", expand=True)

        self._select_navigation(PAGE_DOWNLOADS)

    def _create_navigation(self, parent: tk.Frame) -> None:
        tk.Label(
            parent,
            text="BIBLIOTECA DE MÍDIA",
            bg=COR_PAINEL,
            fg=COR_TEXTO_SECUNDARIO,
            font=("Segoe UI Semibold", 8),
            anchor="w",
        ).pack(fill="x", padx=12, pady=(12, 6))

        self.navigation = ttk.Treeview(
            parent,
            show="tree",
            selectmode="browse",
            height=20,
        )
        self.navigation.pack(
            fill="both",
            expand=True,
            padx=4,
            pady=(0, 8),
        )

        root = self.navigation.insert(
            "",
            "end",
            text="Biblioteca de Mídia",
            open=True,
        )
        self.nav_downloads = self.navigation.insert(root, "end", text="Downloads")
        self.nav_queue = self.navigation.insert(root, "end", text="Fila de downloads")
        self.nav_storage = self.navigation.insert(root, "end", text="Armazenamento")
        self.nav_history = self.navigation.insert(root, "end", text="Histórico")
        self.nav_system = self.navigation.insert(root, "end", text="Sistema")

        self.navigation.bind("<<TreeviewSelect>>", self._on_navigation_change)
        self.navigation.bind(
            "<Return>",
            lambda _event: self._activate_navigation(),
        )

    def _on_navigation_change(self, _event: Any = None) -> None:
        selected = self.navigation.selection()
        if not selected:
            return

        mapping = {
            self.nav_downloads: PAGE_DOWNLOADS,
            self.nav_queue: PAGE_QUEUE,
            self.nav_storage: PAGE_STORAGE,
            self.nav_history: PAGE_HISTORY,
            self.nav_system: PAGE_SYSTEM,
        }
        page = mapping.get(selected[0])
        if page:
            self._show_page(page)

    def _activate_navigation(self) -> None:
        self._on_navigation_change()

    def _select_navigation(self, page: str) -> None:
        self._assert_ui_thread()
        mapping = {
            PAGE_DOWNLOADS: self.nav_downloads,
            PAGE_QUEUE: self.nav_queue,
            PAGE_STORAGE: self.nav_storage,
            PAGE_HISTORY: self.nav_history,
            PAGE_SYSTEM: self.nav_system,
        }
        node = mapping.get(page)
        if node:
            try:
                if self.navigation.selection() != (node,):
                    self.navigation.selection_set(node)
            except tk.TclError:
                pass
        self._show_page(page)

    def _show_page(self, page: str) -> None:
        self._assert_ui_thread()
        self._current_page = page

        for child in self.content_frame.winfo_children():
            child.destroy()

        if page == PAGE_DOWNLOADS:
            self._build_downloads_page()
        elif page == PAGE_QUEUE:
            self._build_queue_page()
        elif page == PAGE_STORAGE:
            self._build_storage_page()
        elif page == PAGE_HISTORY:
            self._build_history_page()
        elif page == PAGE_SYSTEM:
            self._build_system_page()

    # ========================================================================
    # HELPERS VISUAIS
    # ========================================================================

    @staticmethod
    def _group_frame(parent: tk.Misc) -> tk.Frame:
        return tk.Frame(
            parent,
            bg=COR_PAINEL,
            highlightbackground=COR_BORDA,
            highlightthickness=1,
        )

    @staticmethod
    def _group_title(parent: tk.Frame, text: str) -> None:
        tk.Label(
            parent,
            text=text.upper(),
            bg="#F7F7F7",
            fg=COR_TEXTO_SECUNDARIO,
            font=("Segoe UI Semibold", 8),
            anchor="w",
        ).pack(fill="x", padx=1, pady=1, ipady=4)

    def _page_header(self, title: str, description: str) -> tk.Frame:
        frame = tk.Frame(self.content_frame, bg=COR_FUNDO)
        tk.Label(
            frame,
            text=title,
            bg=COR_FUNDO,
            fg=COR_TEXTO,
            font=("Segoe UI Semibold", 15),
            anchor="w",
        ).pack(anchor="w")
        tk.Label(
            frame,
            text=description,
            bg=COR_FUNDO,
            fg=COR_TEXTO_SECUNDARIO,
            font=("Segoe UI", 8),
            anchor="w",
        ).pack(anchor="w", pady=(1, 0))
        return frame

    # ========================================================================
    # PÁGINAS
    # ========================================================================

    def _build_downloads_page(self) -> None:
        header = self._page_header(
            "Downloads",
            "Adicione URLs à fila de processamento.",
        )
        header.pack(fill="x", padx=12, pady=(10, 4))

        group = self._group_frame(self.content_frame)
        group.pack(fill="x", padx=12, pady=6)
        self._group_title(group, "Origem")

        tk.Label(
            group,
            text="Uma URL por linha:",
            bg=COR_PAINEL,
            fg=COR_TEXTO,
            font=("Segoe UI", 9),
        ).pack(anchor="w", padx=10, pady=(5, 3))

        text_frame = tk.Frame(group, bg=COR_PAINEL)
        text_frame.pack(fill="x", padx=10, pady=4)

        self.txt_urls = tk.Text(
            text_frame,
            height=8,
            wrap="none",
            undo=True,
            font=("Cascadia Mono", 9),
            bg="#FAFAFA",
            fg=COR_TEXTO,
            insertbackground=COR_TEXTO,
            relief="solid",
            borderwidth=1,
            highlightthickness=0,
        )
        self.txt_urls.pack(side="left", fill="both", expand=True)

        yscroll = ttk.Scrollbar(
            text_frame,
            orient="vertical",
            command=self.txt_urls.yview,
        )
        yscroll.pack(side="right", fill="y")

        self.txt_urls.configure(yscrollcommand=yscroll.set)

        controls = tk.Frame(group, bg=COR_PAINEL)
        controls.pack(fill="x", padx=10, pady=(3, 10))

        tk.Label(
            controls,
            text="Usuário:",
            bg=COR_PAINEL,
            fg=COR_TEXTO_SECUNDARIO,
            font=("Segoe UI", 8),
        ).pack(side="left")

        self.entry_user = ttk.Entry(controls, width=22)
        self.entry_user.pack(side="left", padx=(6, 18))

        ttk.Button(
            controls,
            text="Limpar",
            command=self._clear_input,
        ).pack(side="right", padx=(5, 0))
        ttk.Button(
            controls,
            text="Adicionar à fila",
            command=self._add_downloads,
        ).pack(side="right")

        batch = self._group_frame(self.content_frame)
        batch.pack(fill="x", padx=12, pady=6)
        self._group_title(batch, "Lote")
        self.lbl_batch_summary = tk.Label(
            batch,
            text=f"Pronto | Máximo de {MAX_URLS_BATCH} URLs por lote",
            bg=COR_PAINEL,
            fg=COR_TEXTO_SECUNDARIO,
            font=("Segoe UI", 8),
            anchor="w",
        )
        self.lbl_batch_summary.pack(fill="x", padx=10, pady=8)

        storage = self._group_frame(self.content_frame)
        storage.pack(fill="x", padx=12, pady=6)
        self._group_title(storage, "Destino de armazenamento")

        body = tk.Frame(storage, bg=COR_PAINEL)
        body.pack(fill="x", padx=10, pady=8)

        left = tk.Frame(body, bg=COR_PAINEL)
        left.pack(side="left", fill="x", expand=True)

        self.lbl_storage_target = tk.Label(
            left,
            text="Downloads locais",
            bg=COR_PAINEL,
            fg=COR_TEXTO,
            font=("Segoe UI Semibold", 10),
            anchor="w",
        )
        self.lbl_storage_target.pack(anchor="w")

        self.lbl_storage_details = tk.Label(
            left,
            text=str(self._download_dir),
            bg=COR_PAINEL,
            fg=COR_TEXTO_SECUNDARIO,
            font=("Segoe UI", 8),
            anchor="w",
        )
        self.lbl_storage_details.pack(anchor="w", pady=(2, 0))

        right = tk.Frame(body, bg=COR_PAINEL)
        right.pack(side="right")

        ttk.Button(
            right,
            text="Atualizar",
            command=self._refresh_drives,
        ).pack(side="left", padx=3)
        ttk.Button(
            right,
            text="Selecionar pasta...",
            command=self._select_custom_destination,
        ).pack(side="left", padx=3)
        ttk.Button(
            right,
            text="Abrir",
            command=self._open_selected_or_destination,
        ).pack(side="left", padx=3)

        queue_group = self._group_frame(self.content_frame)
        queue_group.pack(fill="both", expand=True, padx=12, pady=6)
        self._group_title(queue_group, "Fila atual")
        self.lbl_downloads_empty = tk.Label(
            queue_group,
            text="Nenhum download na fila.",
            bg=COR_PAINEL,
            fg=COR_TEXTO_SECUNDARIO,
            font=("Segoe UI", 9),
        )
        self.lbl_downloads_empty.pack(pady=30)
        ttk.Button(
            queue_group,
            text="Abrir fila de downloads",
            command=lambda: self._select_navigation(PAGE_QUEUE),
        ).pack(pady=(0, 20))

        self._update_target_display(self._selected_destination or self._download_dir)
        self._refresh_download_page()

    def _build_queue_page(self) -> None:
        header = self._page_header(
            "Fila de downloads",
            "Monitore transferências e resultados em tempo real.",
        )
        header.pack(fill="x", padx=12, pady=(10, 4))

        bar = tk.Frame(self.content_frame, bg=COR_FUNDO)
        bar.pack(fill="x", padx=12, pady=4)

        ttk.Button(
            bar,
            text="Adicionar",
            command=self._focus_download_input,
        ).pack(side="left", padx=(0, 4))
        ttk.Button(
            bar,
            text="Cancelar",
            command=self._cancel_selected,
        ).pack(side="left", padx=4)
        ttk.Button(
            bar,
            text="Remover concluídos",
            command=self._clear_completed,
        ).pack(side="left", padx=4)

        self.lbl_queue_count = tk.Label(
            bar,
            text=f"{len(self._items)} item(s)",
            bg=COR_FUNDO,
            fg=COR_TEXTO_SECUNDARIO,
            font=("Segoe UI", 8),
        )
        self.lbl_queue_count.pack(side="right", padx=5)

        table_group = self._group_frame(self.content_frame)
        table_group.pack(fill="both", expand=True, padx=12, pady=5)
        self._group_title(table_group, "Transferências")
        self._create_queue_tree(table_group)
        self._create_details_panel(self.content_frame)
        self._create_log_panel(self.content_frame, compact=True)
        self._refresh_queue_tree()
        self._update_summary()

    def _create_queue_tree(self, parent: tk.Frame) -> None:
        frame = tk.Frame(parent, bg=COR_PAINEL)
        frame.pack(fill="both", expand=True, padx=8, pady=(0, 8))

        columns = (
            "name",
            "source",
            "status",
            "progress",
            "size",
            "speed",
            "eta",
        )
        headings = {
            "name": "Nome",
            "source": "Origem",
            "status": "Status",
            "progress": "Progresso",
            "size": "Tamanho",
            "speed": "Velocidade",
            "eta": "ETA",
        }
        widths = {
            "name": 260,
            "source": 120,
            "status": 110,
            "progress": 85,
            "size": 120,
            "speed": 110,
            "eta": 70,
        }
        anchors = {
            "name": "w",
            "source": "w",
            "status": "w",
            "progress": "center",
            "size": "e",
            "speed": "e",
            "eta": "center",
        }

        self.tree = ttk.Treeview(
            frame,
            columns=columns,
            show="headings",
            selectmode="extended",
        )

        for column in columns:
            self.tree.heading(column, text=headings[column])
            self.tree.column(
                column,
                width=widths[column],
                anchor=anchors[column],
                stretch=True,
            )

        self.tree.tag_configure("queued", foreground=COR_TEXTO)
        self.tree.tag_configure("downloading", foreground=COR_ACENTO)
        self.tree.tag_configure("completed", foreground=COR_SUCESSO)
        self.tree.tag_configure("error", foreground=COR_ERRO)
        self.tree.tag_configure("cancelled", foreground=COR_AVISO)

        self.tree.pack(side="left", fill="both", expand=True)

        yscroll = ttk.Scrollbar(
            frame,
            orient="vertical",
            command=self.tree.yview,
        )
        yscroll.pack(side="right", fill="y")

        xscroll = ttk.Scrollbar(
            parent,
            orient="horizontal",
            command=self.tree.xview,
        )
        xscroll.pack(fill="x", padx=8, pady=(0, 8))

        self.tree.configure(
            yscrollcommand=yscroll.set,
            xscrollcommand=xscroll.set,
        )
        self.tree.bind("<<TreeviewSelect>>", self._on_queue_selection)
        self.tree.bind("<Double-1>", lambda _event: self._open_selected_file())
        self.tree.bind("<Delete>", self._on_tree_delete)

    def _create_details_panel(self, parent: tk.Frame) -> None:
        group = self._group_frame(parent)
        group.pack(fill="x", padx=12, pady=5)
        self._group_title(group, "Detalhes")

        body = tk.Frame(group, bg=COR_PAINEL)
        body.pack(fill="x", padx=10, pady=7)

        self.detail_vars = {
            "name": tk.StringVar(value="-"),
            "source": tk.StringVar(value="-"),
            "status": tk.StringVar(value="-"),
            "progress": tk.StringVar(value="-"),
            "size": tk.StringVar(value="-"),
            "speed": tk.StringVar(value="-"),
            "eta": tk.StringVar(value="-"),
            "path": tk.StringVar(value="-"),
        }

        fields = [
            ("Nome", "name"),
            ("Origem", "source"),
            ("Status", "status"),
            ("Progresso", "progress"),
            ("Tamanho", "size"),
            ("Velocidade", "speed"),
            ("ETA", "eta"),
            ("Saída", "path"),
        ]

        for index, (label, key) in enumerate(fields):
            row = index // 2
            column = (index % 2) * 2
            tk.Label(
                body,
                text=f"{label}:",
                bg=COR_PAINEL,
                fg=COR_TEXTO_SECUNDARIO,
                font=("Segoe UI", 8),
                width=10,
                anchor="e",
            ).grid(
                row=row,
                column=column,
                sticky="e",
                padx=(2, 5),
                pady=2,
            )
            tk.Label(
                body,
                textvariable=self.detail_vars[key],
                bg=COR_PAINEL,
                fg=COR_TEXTO,
                font=("Segoe UI", 8),
                anchor="w",
            ).grid(
                row=row,
                column=column + 1,
                sticky="we",
                padx=(0, 16),
                pady=2,
            )

        body.grid_columnconfigure(1, weight=1)
        body.grid_columnconfigure(3, weight=1)

    def _create_log_panel(self, parent: tk.Frame, compact: bool = False) -> None:
        group = tk.Frame(
            parent,
            bg=COR_CONSOLE,
            highlightbackground=COR_BORDA,
            highlightthickness=1,
        )
        group.pack(fill="x", padx=12, pady=(4, 6))

        header = tk.Frame(group, bg=COR_CONSOLE_CABECALHO)
        header.pack(fill="x")
        tk.Label(
            header,
            text="LOG DO SISTEMA",
            bg=COR_CONSOLE_CABECALHO,
            fg="#AAAAAA",
            font=("Segoe UI Semibold", 8),
        ).pack(side="left", padx=8, pady=3)
        ttk.Button(
            header,
            text="Limpar",
            command=self._clear_log,
        ).pack(side="right", padx=4, pady=2)

        self.console = tk.Text(
            group,
            height=4 if compact else 7,
            wrap="none",
            state="disabled",
            font=("Cascadia Mono", 8),
            bg=COR_CONSOLE,
            fg=COR_CONSOLE_TEXTO,
            insertbackground=COR_CONSOLE_TEXTO,
            relief="flat",
            borderwidth=0,
            padx=7,
            pady=5,
        )
        self.console.pack(fill="x")

        self.console.tag_configure("INFO", foreground=COR_CONSOLE_TEXTO)
        self.console.tag_configure("OK", foreground="#6CCB5F")
        self.console.tag_configure("WARN", foreground="#E5C07B")
        self.console.tag_configure("ERROR", foreground="#F48771")

        for level, line in self._log_entries[-100:]:
            self._console_insert(line, level)
        self.console.see("end")

    def _create_status_bar(self) -> None:
        bar = tk.Frame(
            self,
            bg=COR_STATUS,
            highlightbackground=COR_BORDA,
            highlightthickness=1,
            height=25,
        )
        bar.pack(fill="x")
        bar.pack_propagate(False)

        self.lbl_status = tk.Label(
            bar,
            text="Pronto",
            bg=COR_STATUS,
            fg=COR_TEXTO_SECUNDARIO,
            font=("Segoe UI", 8),
            anchor="w",
        )
        self.lbl_status.pack(side="left", padx=8)

        self.lbl_counts = tk.Label(
            bar,
            text="Fila: 0 | Ativos: 0 | Concluídos: 0 | Erros: 0",
            bg=COR_STATUS,
            fg=COR_TEXTO_SECUNDARIO,
            font=("Segoe UI", 8),
            anchor="e",
        )
        self.lbl_counts.pack(side="right", padx=8)

    # ========================================================================
    # STORAGE / HISTORY / SYSTEM PAGES
    # ========================================================================

    def _build_storage_page(self) -> None:
        header = self._page_header(
            "Armazenamento",
            "Gerencie destinos removíveis e armazenamento local.",
        )
        header.pack(fill="x", padx=12, pady=(10, 4))

        group = self._group_frame(self.content_frame)
        group.pack(fill="x", padx=12, pady=6)
        self._group_title(group, "Dispositivos removíveis")

        if not self.pendrives:
            tk.Label(
                group,
                text="Nenhum dispositivo removível detectado.",
                bg=COR_PAINEL,
                fg=COR_TEXTO_SECUNDARIO,
                font=("Segoe UI", 9),
            ).pack(anchor="w", padx=10, pady=12)
        else:
            for drive in self.pendrives:
                self._create_drive_row(group, drive)

        local = self._group_frame(self.content_frame)
        local.pack(fill="x", padx=12, pady=6)
        self._group_title(local, "Armazenamento local")

        body = tk.Frame(local, bg=COR_PAINEL)
        body.pack(fill="x", padx=10, pady=10)
        tk.Label(
            body,
            text=str(self._download_dir),
            bg=COR_PAINEL,
            fg=COR_TEXTO,
            font=("Cascadia Mono", 8),
            anchor="w",
        ).pack(side="left", fill="x", expand=True)
        ttk.Button(
            body,
            text="Abrir",
            command=self._open_download_directory,
        ).pack(side="right", padx=(8, 0))
        ttk.Button(
            body,
            text="Atualizar",
            command=self._refresh_drives,
        ).pack(side="right")

    def _create_drive_row(self, parent: tk.Frame, drive: Any) -> None:
        row = tk.Frame(parent, bg=COR_PAINEL)
        row.pack(fill="x", padx=10, pady=5)

        name = str(
            getattr(
                drive,
                "nome_exibicao",
                "Dispositivo removível",
            )
        )
        letter = str(getattr(drive, "letra", ""))
        selected = bool(
            letter and self._selected_destination == Path(letter)
        )

        tk.Label(
            row,
            text=name,
            bg=COR_PAINEL,
            fg=COR_ACENTO if selected else COR_TEXTO,
            font=("Segoe UI Semibold", 9),
            anchor="w",
        ).pack(side="left")
        tk.Label(
            row,
            text=letter,
            bg=COR_PAINEL,
            fg=COR_TEXTO_SECUNDARIO,
            font=("Cascadia Mono", 8),
        ).pack(side="left", padx=10)
        ttk.Button(
            row,
            text="Abrir",
            command=lambda p=letter: self._open_drive(p),
        ).pack(side="right")
        ttk.Button(
            row,
            text="Selecionar",
            command=lambda d=drive: self._select_drive(d),
        ).pack(side="right", padx=4)

    def _build_history_page(self) -> None:
        header = self._page_header(
            "Histórico",
            "Operações concluídas, canceladas e com erro.",
        )
        header.pack(fill="x", padx=12, pady=(10, 4))

        group = self._group_frame(self.content_frame)
        group.pack(fill="both", expand=True, padx=12, pady=6)
        self._group_title(group, "Histórico de operações")

        frame = tk.Frame(group, bg=COR_PAINEL)
        frame.pack(fill="both", expand=True, padx=8, pady=(0, 8))

        tree = ttk.Treeview(
            frame,
            columns=(
                "time",
                "name",
                "status",
                "storage",
                "output",
                "message",
            ),
            show="headings",
        )

        headings = {
            "time": "Hora",
            "name": "Nome",
            "status": "Status",
            "storage": "Armazenamento",
            "output": "Saída",
            "message": "Mensagem",
        }
        widths = {
            "time": 80,
            "name": 220,
            "status": 100,
            "storage": 130,
            "output": 350,
            "message": 300,
        }

        for column in headings:
            tree.heading(column, text=headings[column])
            tree.column(column, width=widths[column], anchor="w")

        tree.pack(side="left", fill="both", expand=True)
        yscroll = ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
        yscroll.pack(side="right", fill="y")
        tree.configure(yscrollcommand=yscroll.set)

        for entry in reversed(self._history):
            tree.insert(
                "",
                "end",
                values=(
                    str(entry.get("finalizado_em", ""))[-8:],
                    entry.get("arquivo") or entry.get("url", ""),
                    entry.get("status", ""),
                    entry.get("storage_status", ""),
                    entry.get("storage_path", ""),
                    entry.get("mensagem", ""),
                ),
            )

    def _build_system_page(self) -> None:
        header = self._page_header(
            "Sistema",
            "Informações do aplicativo e ambiente de execução.",
        )
        header.pack(fill="x", padx=12, pady=(10, 4))

        group = self._group_frame(self.content_frame)
        group.pack(fill="x", padx=12, pady=6)
        self._group_title(group, "Aplicativo")

        body = tk.Frame(group, bg=COR_PAINEL)
        body.pack(fill="x", padx=10, pady=10)

        try:
            import yt_dlp
            ytdlp_version = str(
                getattr(yt_dlp, "__version__", "Disponível")
            )
        except Exception:
            ytdlp_version = "Indisponível"

        info = [
            ("Aplicativo", APP_NAME),
            ("Versão", APP_VERSION),
            ("Python", sys.version.split()[0]),
            ("yt-dlp", ytdlp_version),
            ("Armazenamento local", str(self._download_dir)),
            ("Dispositivos removíveis", str(len(self.pendrives))),
        ]

        for index, (label, value) in enumerate(info):
            tk.Label(
                body,
                text=f"{label}:",
                bg=COR_PAINEL,
                fg=COR_TEXTO_SECUNDARIO,
                font=("Segoe UI", 8),
                width=20,
                anchor="e",
            ).grid(
                row=index,
                column=0,
                padx=(2, 7),
                pady=3,
                sticky="e",
            )
            tk.Label(
                body,
                text=value,
                bg=COR_PAINEL,
                fg=COR_TEXTO,
                font=("Segoe UI", 8),
                anchor="w",
            ).grid(
                row=index,
                column=1,
                padx=2,
                pady=3,
                sticky="w",
            )

    # ========================================================================
    # INPUT / DOWNLOADS
    # ========================================================================

    def _focus_download_input(self) -> None:
        self._select_navigation(PAGE_DOWNLOADS)
        try:
            self.after(50, self._focus_textbox)
        except tk.TclError:
            pass

    def _focus_textbox(self) -> None:
        widget = getattr(self, "txt_urls", None)
        if self._widget_alive(widget):
            try:
                widget.focus_set()
            except tk.TclError:
                pass

    def _add_downloads(self) -> None:
        if not self._widget_alive(getattr(self, "txt_urls", None)):
            self._select_navigation(PAGE_DOWNLOADS)
            try:
                self.after(50, self._add_downloads)
            except tk.TclError:
                pass
            return

        try:
            text = self.txt_urls.get("1.0", "end-1c").strip()
        except tk.TclError:
            return

        if not text:
            messagebox.showwarning(
                APP_NAME,
                "Informe pelo menos uma URL.",
                parent=self,
            )
            self._focus_textbox()
            return

        self._save_user_config()

        raw_urls = [
            line.strip()
            for line in text.splitlines()
            if line.strip()
        ]

        if len(raw_urls) > MAX_URLS_BATCH:
            self._update_batch_summary(
                len(raw_urls),
                0,
                0,
                0,
                0,
                True,
            )
            messagebox.showwarning(
                APP_NAME,
                (
                    f"O máximo é de {MAX_URLS_BATCH} URLs por lote.\n\n"
                    f"Recebidas: {len(raw_urls)}"
                ),
                parent=self,
            )
            return

        seen: set[str] = set()
        existing_urls = {
            _item_url(item)
            for item in self._items.values()
        }

        valid: list[str] = []
        duplicate_count = 0
        invalid_count = 0

        for url in raw_urls:
            if url in seen or url in existing_urls:
                duplicate_count += 1
                continue
            seen.add(url)

            if not _validar_url(url):
                invalid_count += 1
                continue

            valid.append(url)

        queued = 0

        for url in valid:
            try:
                item = DownloadItem(
                    url=url,
                    formato="video",
                )
                row_id = str(uuid.uuid4())

                self._items[row_id] = item
                self._row_names[row_id] = self._display_name(item)
                self._created_at[row_id] = _agora()
                self._storage_status[row_id] = "Waiting for download"

                self._downloader.adicionar(item)
                queued += 1
                self._log(f"Na fila: {url}")
            except Exception as exc:
                logger.exception("Falha ao enfileirar URL")
                self._log(
                    f"Falha ao enfileirar {url}: {exc}",
                    level="ERROR",
                )

        self._clear_input()
        self._update_batch_summary(
            len(raw_urls),
            len(valid),
            duplicate_count,
            invalid_count,
            queued,
            False,
        )
        self._refresh_queue_tree()
        self._update_summary()
        self._refresh_download_page()
        self._set_status(
            f"Lote processado: {queued} URL(s) adicionada(s)"
        )

    def _update_batch_summary(
        self,
        total_received: int,
        valid_count: int,
        duplicate_count: int,
        invalid_count: int,
        queued_count: int,
        rejected: bool,
    ) -> None:
        widget = getattr(self, "lbl_batch_summary", None)
        if not self._widget_alive(widget):
            return

        try:
            if rejected:
                widget.configure(
                    text=(
                        f"Rejeitado | {total_received} URLs | "
                        f"Máximo: {MAX_URLS_BATCH}"
                    ),
                    fg=COR_ERRO,
                )
                return

            widget.configure(
                text=(
                    f"Recebidas: {total_received}  |  "
                    f"Válidas: {valid_count}  |  "
                    f"Duplicadas: {duplicate_count}  |  "
                    f"Inválidas: {invalid_count}  |  "
                    f"Adicionadas: {queued_count}"
                ),
                fg=(
                    COR_SUCESSO
                    if queued_count == valid_count
                    else COR_AVISO
                ),
            )
        except tk.TclError:
            pass

    def _clear_input(self) -> None:
        widget = getattr(self, "txt_urls", None)
        if not self._widget_alive(widget):
            return
        try:
            widget.delete("1.0", "end")
        except tk.TclError:
            pass

    # ========================================================================
    # DOWNLOAD CALLBACK / ESTADOS
    # ========================================================================

    def _on_download_update(self, item: DownloadItem) -> None:
        """Callback do worker; somente envia evento à thread da UI."""
        self._post_event("download", item=item)

    def _find_row_for_item(self, item: DownloadItem) -> Optional[str]:
        for row_id, current in self._items.items():
            if current is item:
                return row_id
        return None

    def _apply_download_update(self, item: DownloadItem, *_args: Any) -> None:
        """Compatível com testes e chamadas legadas que passam somente o item."""
        self._assert_ui_thread()

        if self._closing:
            return

        row_id = self._find_row_for_item(item)
        if row_id is None:
            return

        status = self._normalize_status(item.status)

        self._ensure_item_row(row_id, item)
        if self._widget_alive(getattr(self, "tree", None)):
            self._update_queue_row(row_id, item)

        if self._selected_row == row_id:
            self._update_details(item)

        if status == STATUS_DOWNLOADING:
            self._set_status(
                f"Baixando: {self._row_names.get(row_id, item.url)}"
            )

        elif status == STATUS_COMPLETED:
            if row_id not in self._completion_handled:
                self._completion_handled.add(row_id)
                self._log(
                    f"Download concluído: {_item_output(item) or item.url}",
                    level="OK",
                )
                self._set_status("Download concluído")
                self._record_history(
                    row_id,
                    STATUS_COMPLETED,
                    "Download concluído",
                )
                self._copy_completed_item(row_id, item)

        elif status == STATUS_CANCELLED:
            self._set_status("Download cancelado")
            self._log(
                f"Download cancelado: {item.url}",
                level="WARN",
            )
            self._record_history(
                row_id,
                STATUS_CANCELLED,
                item.erro or "Download cancelado",
            )

        elif status == STATUS_ERROR:
            self._set_status("Download com erro")
            self._log(
                f"Falha no download: {item.erro or item.url}",
                level="ERROR",
            )
            self._record_history(
                row_id,
                STATUS_ERROR,
                item.erro or "Erro de download",
            )

        self._update_summary()
        self._refresh_download_page()

    def _normalize_status(self, status: Any) -> str:
        """Normaliza estados internos/legados para os estados canônicos da UI."""
        return _canonical_status(status)

    # ========================================================================
    # TABELA / DETALHES
    # ========================================================================

    def _ensure_item_row(self, row_id: str, item: DownloadItem) -> None:
        tree = getattr(self, "tree", None)
        if not self._widget_alive(tree):
            return
        try:
            if tree.exists(row_id):
                return

            status = self._normalize_status(item.status)
            tree.insert(
                "",
                "end",
                iid=row_id,
                values=(
                    self._row_names.get(
                        row_id,
                        self._display_name(item),
                    ),
                    _item_type(item),
                    status,
                    f"{item.progresso:.0f}%",
                    item.tamanho or "-",
                    item.velocidade or "-",
                    item.tempo_restante or "-",
                ),
                tags=(self._status_tag(status),),
            )
        except tk.TclError:
            pass

    def _refresh_queue_tree(self) -> None:
        tree = getattr(self, "tree", None)
        if not self._widget_alive(tree):
            return

        try:
            selected = set(tree.selection())
            for row_id in tree.get_children():
                tree.delete(row_id)

            for row_id, item in self._items.items():
                self._ensure_item_row(row_id, item)

            valid = [
                row_id
                for row_id in selected
                if tree.exists(row_id)
            ]
            if valid:
                tree.selection_set(valid)
        except tk.TclError:
            pass

    def _update_queue_row(
        self,
        row_id: str,
        item: DownloadItem,
    ) -> None:
        """Atualiza uma linha existente usando status canônico."""
        tree = getattr(self, "tree", None)
        if not self._widget_alive(tree):
            return

        try:
            if not tree.exists(row_id):
                self._ensure_item_row(row_id, item)
                if not tree.exists(row_id):
                    return

            status = self._normalize_status(item.status)
            tree.item(
                row_id,
                values=(
                    self._row_names.get(
                        row_id,
                        self._display_name(item),
                    ),
                    _item_type(item),
                    status,
                    f"{item.progresso:.0f}%",
                    item.tamanho or "-",
                    item.velocidade or "-",
                    item.tempo_restante or "-",
                ),
                tags=(self._status_tag(status),),
            )
        except tk.TclError:
            pass

    @staticmethod
    def _status_tag(status: Any) -> str:
        normalized = _canonical_status(status)
        return {
            STATUS_QUEUED: "queued",
            STATUS_DOWNLOADING: "downloading",
            STATUS_COMPLETED: "completed",
            STATUS_ERROR: "error",
            STATUS_CANCELLED: "cancelled",
        }.get(normalized, "queued")

    def _on_queue_selection(self, _event: Any = None) -> None:
        tree = getattr(self, "tree", None)
        if not self._widget_alive(tree):
            self._selected_row = None
            self._clear_details()
            return

        try:
            selected = tree.selection()
        except tk.TclError:
            return

        if not selected:
            self._selected_row = None
            self._clear_details()
            return

        self._selected_row = selected[0]
        item = self._items.get(self._selected_row)
        if item is not None:
            self._update_details(item)

    def _update_details(self, item: DownloadItem) -> None:
        detail_vars = getattr(self, "detail_vars", None)
        if detail_vars is None:
            return

        try:
            detail_vars["name"].set(self._display_name(item))
            detail_vars["source"].set(_item_type(item))
            detail_vars["status"].set(self._normalize_status(item.status))
            detail_vars["progress"].set(f"{item.progresso:.1f}%")
            detail_vars["size"].set(item.tamanho or "-")
            detail_vars["speed"].set(item.velocidade or "-")
            detail_vars["eta"].set(item.tempo_restante or "-")
            detail_vars["path"].set(
                str(item.arquivo_final)
                if item.arquivo_final
                else "-"
            )
        except (tk.TclError, KeyError):
            pass

    def _clear_details(self) -> None:
        detail_vars = getattr(self, "detail_vars", None)
        if detail_vars is None:
            return
        try:
            for variable in detail_vars.values():
                variable.set("-")
        except tk.TclError:
            pass

    # ========================================================================
    # STORAGE COPY
    # ========================================================================

    def _copy_completed_item(self, row_id: str, item: DownloadItem) -> None:
        self._assert_ui_thread()

        if self._closing or row_id in self._organizing_items:
            return

        source = _item_output(item)
        if source is None or not source.exists():
            self._storage_status[row_id] = "Invalid output"
            self._log(
                "Download concluído sem arquivo final válido.",
                level="ERROR",
            )
            return

        destination = self._get_selected_drive(allow_dialog=False)
        if destination is None:
            self._storage_status[row_id] = "Waiting for destination"
            self._log(
                "Nenhum destino selecionado; arquivo permanece local."
            )
            self._record_history(
                row_id,
                STATUS_COMPLETED,
                "Arquivo mantido em Downloads locais",
            )
            return

        username = self._get_current_username()

        self._organizing_items.add(row_id)
        self._storage_status[row_id] = "Copying"
        self._set_status(f"Copiando {source.name}...")
        self._log(f"Copiando {source.name} para {destination}")

        try:
            future = self._storage_executor.submit(
                organizar_e_copiar,
                source,
                destination,
                username,
            )
        except RuntimeError as exc:
            self._organizing_items.discard(row_id)
            self._storage_status[row_id] = "Failed"
            self._log(
                f"Falha ao iniciar cópia: {exc}",
                level="ERROR",
            )
            return

        with self._future_lock:
            self._storage_futures.add(future)
            self._storage_future_item[future] = row_id

        future.add_done_callback(self._storage_future_done)

    def _storage_future_done(self, future: Future[Any]) -> None:
        with self._future_lock:
            row_id = self._storage_future_item.get(future, "")

        if not row_id or self._closing:
            return

        try:
            result = future.result()
        except Exception as exc:
            self._post_event(
                "storage_error",
                row_id=row_id,
                error=exc,
                future=future,
            )
        else:
            self._post_event(
                "storage_ok",
                row_id=row_id,
                result=result,
                future=future,
            )

    def _forget_storage_future(self, future: Optional[Future[Any]]) -> None:
        if future is None:
            return
        with self._future_lock:
            self._storage_futures.discard(future)
            self._storage_future_item.pop(future, None)

    def _storage_copy_succeeded(
        self,
        row_id: str,
        result: Any,
        future: Optional[Future[Any]] = None,
    ) -> None:
        self._assert_ui_thread()
        self._forget_storage_future(future)
        self._organizing_items.discard(row_id)
        self._storage_status[row_id] = "Completed"
        self._storage_paths[row_id] = str(result)
        self._log(
            f"Armazenamento concluído: {result}",
            level="OK",
        )
        self._set_status("Arquivo copiado para o destino")
        self._record_history(
            row_id,
            STATUS_COMPLETED,
            "Armazenamento concluído",
        )

    def _storage_copy_failed(
        self,
        row_id: str,
        error: Exception,
        future: Optional[Future[Any]] = None,
    ) -> None:
        self._assert_ui_thread()
        self._forget_storage_future(future)
        self._organizing_items.discard(row_id)
        self._storage_status[row_id] = "Failed"
        self._log(
            f"Falha no armazenamento: {error}",
            level="ERROR",
        )
        self._set_status("Falha ao copiar arquivo")
        self._record_history(
            row_id,
            STATUS_COMPLETED,
            str(error),
        )

    # ========================================================================
    # DESTINO / DRIVES
    # ========================================================================

    def _select_custom_directory(self) -> Optional[Path]:
        try:
            selected = filedialog.askdirectory(
                parent=self,
                title="Selecionar pasta de destino",
            )
        except tk.TclError:
            return None
        return Path(selected) if selected else None

    def _get_selected_drive(self, allow_dialog: bool = True) -> Optional[Path]:
        return self._get_selected_destination(allow_dialog=allow_dialog)

    def _select_drive(self, drive: Any) -> None:
        letter = getattr(drive, "letra", None)
        if not letter:
            self._set_status(
                "O dispositivo selecionado não possui um caminho válido."
            )
            return

        destination = Path(str(letter))
        try:
            exists = destination.exists()
        except OSError:
            exists = False

        if not exists:
            self._set_status(f"Dispositivo indisponível: {destination}")
            return

        self._selected_destination = destination
        name = str(
            getattr(
                drive,
                "nome_exibicao",
                str(destination),
            )
        )
        self._update_target_display(destination, name)
        self._set_status(f"Destino selecionado: {destination}")
        self._log(f"Destino selecionado: {destination}")

        if self._current_page == PAGE_STORAGE:
            self._show_page(PAGE_STORAGE)

    def _select_custom_destination(self) -> None:
        selected = self._select_custom_directory()
        if selected is None:
            return

        self._selected_destination = selected
        self._update_target_display(selected)
        self._set_status(f"Destino selecionado: {selected}")
        self._log(f"Pasta personalizada selecionada: {selected}")

    def _get_selected_destination(self, allow_dialog: bool = True) -> Optional[Path]:
        selected = self._selected_destination
        if selected is not None:
            try:
                if selected.exists():
                    return selected
            except OSError:
                pass
            self._selected_destination = None

        # Não seleciona automaticamente uma unidade removível para uma cópia
        # que está ocorrendo em background se houver destino local explícito.
        if self.pendrives:
            first_letter = getattr(self.pendrives[0], "letra", None)
            if first_letter:
                candidate = Path(str(first_letter))
                try:
                    if candidate.exists():
                        return candidate
                except OSError:
                    pass

        if allow_dialog:
            return self._select_custom_directory()

        return None

    def _update_target_display(
        self,
        destination: Path,
        name: Optional[str] = None,
    ) -> None:
        try:
            is_local = destination.resolve() == self._download_dir.resolve()
        except OSError:
            is_local = destination == self._download_dir

        target = "Downloads locais" if is_local else str(destination)

        widget = getattr(self, "lbl_toolbar_target", None)
        if self._widget_alive(widget):
            try:
                widget.configure(text=f"Destino: {target}")
            except tk.TclError:
                pass

        widget = getattr(self, "lbl_storage_target", None)
        if self._widget_alive(widget):
            try:
                widget.configure(text=name or target)
            except tk.TclError:
                pass

        widget = getattr(self, "lbl_storage_details", None)
        if self._widget_alive(widget):
            try:
                widget.configure(text=str(destination))
            except tk.TclError:
                pass

    def _refresh_drives(self) -> None:
        self._assert_ui_thread()
        if self._closing:
            return

        try:
            self.pendrives = list(listar_pendrives() or [])
        except Exception as exc:
            self.pendrives = []
            self._log(
                f"Falha ao detectar dispositivos: {exc}",
                level="ERROR",
            )
            self._set_status("Falha ao detectar dispositivos")
            self._refresh_visible_page()
            return

        if self._selected_destination is not None:
            try:
                if not self._selected_destination.exists():
                    self._selected_destination = None
            except OSError:
                self._selected_destination = None

        if self._selected_destination is None:
            # Destino padrão: primeira unidade removível disponível;
            # caso não exista, Downloads locais.
            chosen: Optional[Path] = None
            for drive in self.pendrives:
                letter = getattr(drive, "letra", None)
                if not letter:
                    continue
                candidate = Path(str(letter))
                try:
                    if candidate.exists():
                        chosen = candidate
                        break
                except OSError:
                    continue
            self._selected_destination = chosen or self._download_dir

        self._update_target_display(self._selected_destination)

        count = len(self.pendrives)
        if count:
            self._set_status(
                f"{count} dispositivo(s) removível(is) detectado(s)"
            )
        else:
            self._set_status("Nenhum dispositivo removível detectado")

        self._refresh_visible_page()

    def _schedule_drive_refresh(self) -> None:
        if self._closing:
            return
        try:
            self._drive_refresh_after_id = self.after(
                DRIVE_REFRESH_MS,
                self._scheduled_drive_refresh,
            )
        except tk.TclError:
            self._drive_refresh_after_id = None

    def _scheduled_drive_refresh(self) -> None:
        if self._closing:
            return
        self._refresh_drives()
        self._schedule_drive_refresh()

    # ========================================================================
    # OPEN / CONFIG
    # ========================================================================

    def _open_selected_file(self) -> None:
        if not self._selected_row:
            return

        item = self._items.get(self._selected_row)
        output = _item_output(item)

        if output is None or not output.exists():
            self._set_status("Arquivo final indisponível")
            return

        try:
            abrir_pasta(output.parent)
        except Exception as exc:
            self._log(
                f"Não foi possível abrir o arquivo: {exc}",
                level="ERROR",
            )

    def _open_selected_or_destination(self) -> None:
        if self._selected_row:
            self._open_selected_file()
            return

        destination = (
            self._get_selected_destination(allow_dialog=False)
            or self._download_dir
        )
        try:
            abrir_pasta(destination)
        except Exception as exc:
            messagebox.showerror(
                APP_NAME,
                f"Não foi possível abrir o local:\n\n{exc}",
                parent=self,
            )

    def _open_download_directory(self) -> None:
        try:
            abrir_pasta(self._download_dir)
        except Exception as exc:
            messagebox.showerror(
                APP_NAME,
                f"Não foi possível abrir o diretório:\n\n{exc}",
                parent=self,
            )

    def _get_current_username(self) -> str:
        entry_user = getattr(self, "entry_user", None)
        if self._widget_alive(entry_user):
            try:
                value = entry_user.get().strip()
            except tk.TclError:
                value = ""
            if value:
                self._username = value

        return self._username or "local"

    def _load_user_config(self) -> None:
        try:
            config = carregar_config_usuario() or {}
            self._username = (
                str(config.get("nome_usuario", "")).strip()
                or "local"
            )
        except Exception as exc:
            self._username = "local"
            self._log(
                f"Falha ao carregar configuração: {exc}",
                level="WARN",
            )

        entry_user = getattr(self, "entry_user", None)
        if not self._widget_alive(entry_user):
            return

        try:
            entry_user.delete(0, "end")
            entry_user.insert(0, self._username)
        except tk.TclError:
            pass

    def _save_user_config(self) -> None:
        username = self._get_current_username()

        try:
            salvar_config_usuario({"nome_usuario": username})
        except Exception as exc:
            self._log(
                f"Falha ao salvar configuração: {exc}",
                level="WARN",
            )

    # ========================================================================
    # HISTORY
    # ========================================================================

    def _load_history(self) -> None:
        try:
            if not HISTORY_FILE.exists():
                self._history = []
                return

            data = json.loads(
                HISTORY_FILE.read_text(encoding="utf-8")
            )
            if isinstance(data, list):
                self._history = data[-MAX_HISTORY:]
        except Exception as exc:
            self._history = []
            logger.exception("Falha ao carregar histórico")
            self._log(
                f"Falha ao carregar histórico: {exc}",
                level="WARN",
            )

    def _save_history(self) -> None:
        try:
            HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
            temp = HISTORY_FILE.with_suffix(".tmp")
            temp.write_text(
                json.dumps(
                    self._history[-MAX_HISTORY:],
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            temp.replace(HISTORY_FILE)
        except Exception:
            logger.exception("Falha ao salvar histórico")

    def _record_history(
        self,
        row_id: str,
        status: str,
        message: str,
    ) -> None:
        item = self._items.get(row_id)
        if item is None:
            return

        canonical_status = self._normalize_status(status)
        record = {
            "id": row_id,
            "url": item.url,
            "arquivo": (
                str(item.arquivo_final)
                if item.arquivo_final
                else ""
            ),
            "tipo": item.tipo,
            "status": canonical_status,
            "mensagem": message,
            "criado_em": self._created_at.get(row_id, _agora()),
            "finalizado_em": _agora(),
            "storage_status": self._storage_status.get(
                row_id,
                "Not processed",
            ),
            "storage_path": self._storage_paths.get(row_id, ""),
        }

        self._history = [
            old
            for old in self._history
            if old.get("id") != row_id
        ]
        self._history.append(record)
        self._history = self._history[-MAX_HISTORY:]
        self._save_history()

    # ========================================================================
    # LOG / STATUS / SUMMARY
    # ========================================================================

    def _console_insert(self, text: str, level: str) -> None:
        console = getattr(self, "console", None)
        if not self._widget_alive(console):
            return

        try:
            console.configure(state="normal")
            console.insert("end", text, level)
            console.configure(state="disabled")
            console.see("end")
        except tk.TclError:
            pass

    def _log(
        self,
        level_or_message: str,
        message: Optional[str] = None,
        level: str = "INFO",
    ) -> None:
        # Compatibilidade com os dois formatos:
        # _log("mensagem") e _log("ERROR", "mensagem").
        if message is not None:
            actual_level = str(level_or_message).upper()
            text = message
        else:
            actual_level = str(level).upper()
            text = level_or_message

        timestamp = datetime.now().strftime("%H:%M:%S")
        line = f"{timestamp}  {actual_level:<5} {text}\n"
        self._log_entries.append((actual_level, line))
        if len(self._log_entries) > MAX_LOG_LINES:
            self._log_entries = self._log_entries[-MAX_LOG_LINES:]

        self._console_insert(line, actual_level)

        if actual_level == "ERROR":
            logger.error(text)
        elif actual_level in {"WARN", "WARNING"}:
            logger.warning(text)
        else:
            logger.info(text)

    def _clear_log(self) -> None:
        self._log_entries.clear()
        console = getattr(self, "console", None)
        if not self._widget_alive(console):
            return
        try:
            console.configure(state="normal")
            console.delete("1.0", "end")
            console.configure(state="disabled")
        except tk.TclError:
            pass

    def _set_status(self, text: str) -> None:
        if self._closing:
            return

        for widget_name in ("lbl_status", "lbl_header_state"):
            widget = getattr(self, widget_name, None)
            if not self._widget_alive(widget):
                continue
            try:
                widget.configure(text=text)
            except tk.TclError:
                pass

    def _update_summary(self) -> None:
        queued = 0
        active = 0
        completed = 0
        errors = 0

        for item in self._items.values():
            status = self._normalize_status(item.status)
            if status == STATUS_QUEUED:
                queued += 1
            elif status == STATUS_DOWNLOADING:
                active += 1
            elif status == STATUS_COMPLETED:
                completed += 1
            elif status == STATUS_ERROR:
                errors += 1

        widget = getattr(self, "lbl_counts", None)
        if self._widget_alive(widget):
            try:
                widget.configure(
                    text=(
                        f"Fila: {queued} | "
                        f"Ativos: {active} | "
                        f"Concluídos: {completed} | "
                        f"Erros: {errors}"
                    )
                )
            except tk.TclError:
                pass

        widget = getattr(self, "lbl_queue_count", None)
        if self._widget_alive(widget):
            try:
                widget.configure(text=f"{len(self._items)} item(s)")
            except tk.TclError:
                pass

    def _refresh_download_page(self) -> None:
        widget = getattr(self, "lbl_downloads_empty", None)
        if not self._widget_alive(widget):
            return

        active = sum(
            1
            for item in self._items.values()
            if self._normalize_status(item.status)
            in {STATUS_QUEUED, STATUS_DOWNLOADING}
        )

        try:
            if active:
                widget.configure(
                    text=(
                        f"{active} download(s) ativo(s) "
                        "ou aguardando."
                    ),
                    fg=COR_ACENTO,
                )
            elif self._items:
                widget.configure(
                    text="Nenhum download ativo.",
                    fg=COR_TEXTO_SECUNDARIO,
                )
            else:
                widget.configure(
                    text="Nenhum download na fila.",
                    fg=COR_TEXTO_SECUNDARIO,
                )
        except tk.TclError:
            pass

    def _refresh_visible_page(self) -> None:
        if self._closing:
            return
        try:
            if self._current_page == PAGE_DOWNLOADS:
                self._refresh_download_page()
            elif self._current_page == PAGE_QUEUE:
                self._refresh_queue_tree()
                self._update_summary()
        except tk.TclError:
            pass

    # ========================================================================
    # CONTROLE DA FILA
    # ========================================================================

    def _clear_completed(self) -> None:
        removable = [
            row_id
            for row_id, item in self._items.items()
            if self._normalize_status(item.status) in FINISHED_STATUSES
        ]

        tree = getattr(self, "tree", None)
        for row_id in removable:
            if self._widget_alive(tree):
                try:
                    if tree.exists(row_id):
                        tree.delete(row_id)
                except tk.TclError:
                    pass

            self._items.pop(row_id, None)
            self._row_names.pop(row_id, None)
            self._created_at.pop(row_id, None)
            self._storage_status.pop(row_id, None)
            self._storage_paths.pop(row_id, None)
            self._completion_handled.discard(row_id)

        self._selected_row = None
        self._update_summary()
        self._refresh_download_page()
        self._clear_details()
        self._log(
            f"{len(removable)} item(ns) concluído(s) removido(s)."
        )
        self._set_status(
            f"{len(removable)} item(ns) concluído(s) removido(s)"
        )

    def _cancel_selected(self) -> None:
        tree = getattr(self, "tree", None)
        if not self._widget_alive(tree):
            self._select_navigation(PAGE_QUEUE)
            return

        try:
            selected = tree.selection()
        except tk.TclError:
            return

        if not selected:
            self._set_status("Selecione um ou mais itens da fila.")
            return

        count = 0
        for row_id in selected:
            item = self._items.get(row_id)
            if item is None:
                continue

            status = self._normalize_status(item.status)
            if status in {STATUS_QUEUED, STATUS_DOWNLOADING}:
                item.cancelar = True
                count += 1
                self._log(
                    f"Cancelamento solicitado: {item.url}",
                    level="WARN",
                )

        if count:
            self._set_status(
                f"Cancelamento solicitado para {count} item(ns)"
            )
        else:
            self._set_status("Nenhum item ativo selecionado")

    def _on_tree_delete(self, _event: Any = None) -> str:
        self._cancel_selected()
        return "break"

    # ========================================================================
    # ATALHOS
    # ========================================================================

    def _bind_shortcuts(self) -> None:
        self.bind_all("<F5>", self._shortcut_refresh)
        self.bind_all("<Control-l>", self._shortcut_clear_log)
        self.bind_all("<Control-Return>", self._shortcut_add)
        self.bind_all("<Delete>", self._shortcut_delete)

    def _shortcut_refresh(self, _event: Any = None) -> str:
        self._refresh_drives()
        return "break"

    def _shortcut_clear_log(self, _event: Any = None) -> str:
        self._clear_log()
        return "break"

    def _shortcut_add(self, _event: Any = None) -> str:
        self._add_downloads()
        return "break"

    def _shortcut_delete(self, _event: Any = None) -> str:
        widget = self.focus_get()
        if isinstance(
            widget,
            (tk.Entry, tk.Text, ttk.Entry, ttk.Combobox),
        ):
            return "break"

        if self._current_page == PAGE_QUEUE:
            self._cancel_selected()
        return "break"

    # ========================================================================
    # INICIALIZAÇÃO / SISTEMA
    # ========================================================================

    def _initialise_application(self) -> None:
        if self._closing:
            return

        self._log(
            f"{APP_NAME} {APP_VERSION} inicializado."
        )
        self._log(
            f"Armazenamento local: {self._download_dir}"
        )
        self._log(
            f"Python: {sys.version.split()[0]}"
        )

        try:
            import yt_dlp
            self._log(
                f"yt-dlp: {getattr(yt_dlp, '__version__', 'disponível')}"
            )
        except Exception:
            self._log("yt-dlp: indisponível", level="WARN")

        self._update_summary()
        self._set_status("Pronto")

    def _show_about(self) -> None:
        messagebox.showinfo(
            f"Sobre {APP_NAME}",
            (
                f"{APP_NAME}\n"
                f"Versão {APP_VERSION}\n\n"
                "Ferramenta de gerenciamento de downloads, "
                "organização e armazenamento removível."
            ),
            parent=self,
        )

    # ========================================================================
    # FECHAMENTO
    # ========================================================================

    def _cancel_after(self, attr_name: str) -> None:
        after_id = getattr(self, attr_name, None)
        if after_id is None:
            return
        try:
            self.after_cancel(after_id)
        except tk.TclError:
            pass
        setattr(self, attr_name, None)

    def _on_close(self) -> None:
        if self._shutdown_started:
            return

        self._shutdown_started = True

        try:
            active = [
                item
                for item in self._items.values()
                if self._normalize_status(item.status)
                == STATUS_DOWNLOADING
            ]

            if active:
                answer = messagebox.askyesno(
                    APP_NAME,
                    (
                        f"{len(active)} download(s) ainda estão em execução.\n\n"
                        "Deseja fechar a aplicação?"
                    ),
                    parent=self,
                )
                if not answer:
                    self._shutdown_started = False
                    return
        except tk.TclError:
            # Em teardown de testes a janela pode já estar parcialmente destruída.
            pass

        self._closing = True

        # Impede novos eventos de timers.
        self._cancel_after("_initialise_after_id")
        self._cancel_after("_drive_refresh_after_id")
        self._cancel_after("_poll_event_after_id")

        try:
            self._save_user_config()
            self._save_history()
        except Exception:
            logger.exception("Falha persistindo dados durante fechamento")

        try:
            self._downloader.encerrar(timeout=2.0)
        except Exception:
            logger.exception("Falha ao encerrar downloader")

        try:
            with self._future_lock:
                futures = list(self._storage_futures)
            for future in futures:
                future.cancel()
        except Exception:
            logger.exception("Falha cancelando tarefas de armazenamento")

        try:
            self._storage_executor.shutdown(
                wait=False,
                cancel_futures=True,
            )
        except TypeError:
            try:
                self._storage_executor.shutdown(wait=False)
            except Exception:
                logger.exception("Falha ao encerrar executor")
        except Exception:
            logger.exception("Falha ao encerrar executor")

        try:
            self.destroy()
        except tk.TclError:
            pass

    # ========================================================================
    # HELPERS FINAIS
    # ========================================================================

    @staticmethod
    def _widget_alive(widget: Any) -> bool:
        if widget is None:
            return False
        try:
            return bool(widget.winfo_exists())
        except (tk.TclError, AttributeError):
            return False

    @staticmethod
    def _display_name(item: DownloadItem) -> str:
        url = _item_url(item)
        path = (
            url.split("?", 1)[0]
            .split("#", 1)[0]
            .rstrip("/")
        )
        name = path.rsplit("/", 1)[-1]
        return name or url


def iniciar_app() -> None:
    app = App()
    app.mainloop()


if __name__ == "__main__":
    iniciar_app()
