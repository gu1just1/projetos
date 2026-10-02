// ============================================================
// OS_CORE.JS - GERENCIADOR DO SISTEMA OPERACIONAL WINDOWS 95/98
// Extraído e desacoplado do motor 3D para arquitetura modular
// ============================================================

// ============================================================
// PERFIL CENTRAL DO DESENVOLVEDOR & CONFIGURAÇÃO DE CONTATO
// ============================================================
window.USER_PROFILE = {
    name: "Guilherme Gomes Justi",
    handle: "gu1just1",
    github: "https://github.com/gu1just1",
    linkedin: "https://www.linkedin.com/in/guilherme-justi",
    email: "guiijjusti@gmail.com",
    bio: "Estudante de Ciência da Computação | C, C++, Python, Linux, Web"
};
const USER_PROFILE = window.USER_PROFILE;

// ============================================================
// RETRO-OS KERNEL & PROCESS SUBSYSTEM (LIFECYCLE MANAGEMENT)
// ============================================================
window.RetroOS = window.RetroOS || {};

(function (OS) {
    'use strict';

    class Process {
        constructor(pid, name, windowElement) {
            this.pid = pid;
            this.name = name;
            this.windowElement = windowElement;
            this.startTime = Date.now();

            this.resources = {
                intervals: new Set(),
                timeouts: new Set(),
                rafs: new Set(),
                listeners: []
            };

            this.onDestroy = null;
        }

        setInterval(fn, delay, ...args) {
            const id = window.setInterval(fn, delay, ...args);
            this.resources.intervals.add(id);
            return id;
        }

        clearInterval(id) {
            this.resources.intervals.delete(id);
            window.clearInterval(id);
        }

        setTimeout(fn, delay, ...args) {
            const id = window.setTimeout((...innerArgs) => {
                this.resources.timeouts.delete(id);
                fn(...innerArgs);
            }, delay, ...args);
            this.resources.timeouts.add(id);
            return id;
        }

        clearTimeout(id) {
            this.resources.timeouts.delete(id);
            window.clearTimeout(id);
        }

        requestAnimationFrame(fn) {
            const id = window.requestAnimationFrame((time) => {
                this.resources.rafs.delete(id);
                fn(time);
            });
            this.resources.rafs.add(id);
            return id;
        }

        cancelAnimationFrame(id) {
            this.resources.rafs.delete(id);
            window.cancelAnimationFrame(id);
        }

        addEventListener(target, type, listener, options) {
            if (!target) return;
            target.addEventListener(type, listener, options);
            this.resources.listeners.push({ target, type, listener, options });
        }

        removeEventListener(target, type, listener, options) {
            if (!target) return;
            target.removeEventListener(type, listener, options);
            this.resources.listeners = this.resources.listeners.filter(
                (entry) => !(entry.target === target && entry.type === type && entry.listener === listener)
            );
        }

        destroy() {
            if (typeof this.onDestroy === 'function') {
                try {
                    this.onDestroy();
                } catch (err) {
                    console.error(`[RetroOS:PID ${this.pid}] Erro ao executar onDestroy:`, err);
                }
            }

            this.resources.intervals.forEach((id) => window.clearInterval(id));
            this.resources.intervals.clear();

            this.resources.timeouts.forEach((id) => window.clearTimeout(id));
            this.resources.timeouts.clear();

            this.resources.rafs.forEach((id) => window.cancelAnimationFrame(id));
            this.resources.rafs.clear();

            this.resources.listeners.forEach(({ target, type, listener, options }) => {
                try {
                    target.removeEventListener(type, listener, options);
                } catch (e) { }
            });
            this.resources.listeners = [];

            // Exigência arquitetural: NÃO utilizar removeChild.
            // Aplica a classe .is-hidden e limpa data-pid.
            if (this.windowElement) {
                this.windowElement.classList.add('is-hidden');
                delete this.windowElement.dataset.pid;
            }
        }
    }

    class Kernel {
        constructor() {
            this.processTable = new Map();
            this.nextPid = 100;
        }

        spawn(name, windowElement) {
            if (!windowElement) {
                console.error(`[RetroOS:Kernel] Elemento de janela não fornecido para "${name}".`);
                return null;
            }

            // Se a janela já possuía um processo ativo, limpa o anterior antes de respawnar
            if (windowElement.dataset.pid) {
                this.kill(parseInt(windowElement.dataset.pid, 10));
            }

            const pid = this.nextPid++;
            windowElement.dataset.pid = pid;
            windowElement.classList.remove('is-hidden');

            const process = new Process(pid, name, windowElement);
            this.processTable.set(pid, process);

            return process;
        }

        kill(pid) {
            const process = this.processTable.get(pid);
            if (!process) return false;

            process.destroy();
            this.processTable.delete(pid);
            return true;
        }

        killByElement(windowElement) {
            if (!windowElement) return false;
            const pid = parseInt(windowElement.dataset.pid, 10);
            if (pid && this.processTable.has(pid)) {
                return this.kill(pid);
            }
            windowElement.classList.add('is-hidden');
            delete windowElement.dataset.pid;
            return true;
        }

        getProcess(pid) {
            return this.processTable.get(pid);
        }

        getProcessByElement(windowElement) {
            if (!windowElement || !windowElement.dataset.pid) return null;
            return this.processTable.get(parseInt(windowElement.dataset.pid, 10));
        }

        listProcesses() {
            const list = [];
            this.processTable.forEach((proc) => {
                list.push({
                    pid: proc.pid,
                    name: proc.name,
                    uptime: Math.floor((Date.now() - proc.startTime) / 1000)
                });
            });
            return list;
        }
    }

    OS.Process = Process;
    OS.Kernel = new Kernel();
})(window.RetroOS);

// ============================================================
// RETRO SOUND ENGINE (WEB AUDIO API - PROCEDURAL SYNTHESIS)
// ============================================================
const SoundEngine = {
    ctx: null,
    masterGain: null,
    masterFilter: null,
    volume: 0.7,
    muted: false,
    isUnlocked: false,

    init() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
                this.ctx.resume().catch(() => {});
            }
            return;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        try {
            this.ctx = new AudioContextClass();

            // Recupera configurações persistidas
            try {
                const savedVol = localStorage.getItem('retro_volume');
                if (savedVol !== null) {
                    const parsed = parseFloat(savedVol);
                    if (!isNaN(parsed)) this.volume = Math.max(0, Math.min(1, parsed));
                }
                const savedMute = localStorage.getItem('retro_muted');
                if (savedMute !== null) {
                    this.muted = savedMute === '1';
                }
            } catch (e) {}

            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(this.muted ? 0.0001 : Math.max(0.0001, this.volume * 0.35), this.ctx.currentTime);

            // Filtro passa-baixa vintage para emular alto-falante CRT de gabinete
            this.masterFilter = this.ctx.createBiquadFilter();
            this.masterFilter.type = 'lowpass';
            this.masterFilter.frequency.setValueAtTime(6500, this.ctx.currentTime);

            this.masterGain.connect(this.masterFilter);
            this.masterFilter.connect(this.ctx.destination);
        } catch (err) {
            console.warn('[SoundEngine] Falha ao inicializar AudioContext:', err);
        }
    },

    canPlay() {
        return !!(this.ctx && this.ctx.state === 'running' && !this.muted);
    },

    unlock() {
        if (!this.ctx) this.init();
        if (this.ctx && (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted')) {
            return this.ctx.resume().then(() => {
                this.isUnlocked = true;
            }).catch(() => {});
        } else if (this.ctx && this.ctx.state === 'running') {
            this.isUnlocked = true;
            return Promise.resolve();
        }
        return Promise.resolve();
    },

    setVolume(val) {
        const parsed = parseFloat(val);
        if (isNaN(parsed)) return;
        this.volume = Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
        try { localStorage.setItem('retro_volume', this.volume.toFixed(2)); } catch (e) {}

        if (this.masterGain && this.ctx && this.ctx.state === 'running') {
            const now = this.ctx.currentTime;
            this.masterGain.gain.cancelScheduledValues(now);
            const target = this.muted ? 0.0001 : Math.max(0.0001, this.volume * 0.35);
            this.masterGain.gain.exponentialRampToValueAtTime(target, now + 0.04);
        }
    },

    getVolume() {
        return this.volume;
    },

    setMute(state) {
        this.muted = !!state;
        try { localStorage.setItem('retro_muted', this.muted ? '1' : '0'); } catch (e) {}
        if (this.masterGain && this.ctx && this.ctx.state === 'running') {
            const now = this.ctx.currentTime;
            this.masterGain.gain.cancelScheduledValues(now);
            const target = this.muted ? 0.0001 : Math.max(0.0001, this.volume * 0.35);
            this.masterGain.gain.exponentialRampToValueAtTime(target, now + 0.04);
        }
    },

    isMuted() {
        return this.muted;
    },

    // 1. playClick: clique mecânico percussivo curto (~35ms, onda triangle)
    playClick(type = 'default') {
        try {
            // Debounce inteligente para prevenir disparos duplicados em múltiplos manipuladores
            const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
            if (this._lastClickMs && (nowMs - this._lastClickMs < 30)) {
                return;
            }
            this._lastClickMs = nowMs;

            if (!this.canPlay()) return;
            const now = this.ctx.currentTime;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';

            let baseFreq = 750;
            let endFreq = 220;
            let dur = 0.035;

            if (type === 'subtle') {
                baseFreq = 620;
                endFreq = 300;
                dur = 0.025;
            } else if (type === 'sharp') {
                baseFreq = 950;
                endFreq = 240;
                dur = 0.040;
            }

            osc.frequency.setValueAtTime(baseFreq, now);
            osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.28, now + 0.003);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + dur + 0.01);
        } catch (err) {
            console.warn('[SoundEngine] Erro em playClick:', err);
        }
    },

    // 2. playWindowOpen: sweep ascendente senoidal (280Hz -> 560Hz, ~80ms)
    playWindowOpen() {
        try {
            if (!this.canPlay()) return;
            const now = this.ctx.currentTime;
            const dur = 0.080;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(280, now);
            osc.frequency.exponentialRampToValueAtTime(560, now + dur);

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.25, now + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + dur + 0.01);
        } catch (err) {
            console.warn('[SoundEngine] Erro em playWindowOpen:', err);
        }
    },

    // 3. playWindowClose: sweep descendente senoidal (520Hz -> 240Hz, ~70ms)
    playWindowClose() {
        try {
            if (!this.canPlay()) return;
            const now = this.ctx.currentTime;
            const dur = 0.070;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(520, now);
            osc.frequency.exponentialRampToValueAtTime(240, now + dur);

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.24, now + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + dur + 0.01);
        } catch (err) {
            console.warn('[SoundEngine] Erro em playWindowClose:', err);
        }
    },

    // 4. playChordError: acorde clássico de erro com tríade (C3, C4, D#4, G4) em sawtooth filtrada por BiquadFilter (lowpass ~850Hz) e decay suave
    playChordError() {
        try {
            if (!this.canPlay()) return;
            const now = this.ctx.currentTime;
            const dur = 0.42;

            // Notas: C3 (130.81), C4 (261.63), D#4 (311.13), G4 (392.00)
            const freqs = [130.81, 261.63, 311.13, 392.00];

            const chordFilter = this.ctx.createBiquadFilter();
            chordFilter.type = 'lowpass';
            chordFilter.frequency.setValueAtTime(850, now);

            const chordGain = this.ctx.createGain();
            chordGain.gain.setValueAtTime(0.0001, now);
            chordGain.gain.exponentialRampToValueAtTime(0.32, now + 0.012);
            chordGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

            chordFilter.connect(chordGain);
            chordGain.connect(this.masterGain);

            freqs.forEach(f => {
                const osc = this.ctx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(f, now);
                osc.connect(chordFilter);
                osc.start(now);
                osc.stop(now + dur + 0.02);
            });
        } catch (err) {
            console.warn('[SoundEngine] Erro em playChordError:', err);
        }
    },
    playErrorSound() {
        this.playChordError();
    },

    // 5. playAsterisk: sino harmônico duplo (D5 e A5)
    playAsterisk() {
        try {
            if (!this.canPlay()) return;
            const now = this.ctx.currentTime;
            const dur = 0.35;

            // D5 (587.33Hz) e A5 (880.00Hz)
            const freqs = [587.33, 880.00];

            freqs.forEach((f, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, now);

                const peak = idx === 0 ? 0.22 : 0.16;
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

                osc.connect(gain);
                gain.connect(this.masterGain);

                osc.start(now);
                osc.stop(now + dur + 0.02);
            });
        } catch (err) {
            console.warn('[SoundEngine] Erro em playAsterisk:', err);
        }
    },

    // 6. playStartupJingle: arpejo procedural ascendente de inicialização (C4 -> E4 -> G4 -> C5)
    playStartupJingle() {
        try {
            if (!this.canPlay()) return;
            const now = this.ctx.currentTime;

            // C4 (261.63), E4 (329.63), G4 (392.00), C5 (523.25)
            const notes = [
                { f: 261.63, time: 0.00, dur: 0.45 },
                { f: 329.63, time: 0.10, dur: 0.48 },
                { f: 392.00, time: 0.20, dur: 0.52 },
                { f: 523.25, time: 0.30, dur: 0.70 }
            ];

            notes.forEach(n => {
                const noteStart = now + n.time;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(n.f, noteStart);

                gain.gain.setValueAtTime(0.0001, noteStart);
                gain.gain.exponentialRampToValueAtTime(0.24, noteStart + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + n.dur);

                osc.connect(gain);
                gain.connect(this.masterGain);

                osc.start(noteStart);
                osc.stop(noteStart + n.dur + 0.02);
            });
        } catch (err) {
            console.warn('[SoundEngine] Erro em playStartupJingle:', err);
        }
    },
    playStartupChime() {
        this.playStartupJingle();
    },

    // Hardware retrô (Boot beep e busca de disquete)
    playBootBeep(freq = 820, duration = 0.16) {
        try {
            if (!this.canPlay()) return;
            const now = this.ctx.currentTime;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.26, now + 0.006);
            gain.gain.setValueAtTime(0.26, now + duration * 0.7);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + duration + 0.02);
        } catch (err) {
            console.warn('[SoundEngine] Erro em playBootBeep:', err);
        }
    },

    playFloppySeek(steps = 3) {
        try {
            if (!this.canPlay()) return;
            const now = this.ctx.currentTime;

            for (let i = 0; i < steps; i++) {
                const stepTime = now + (i * 0.045);
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(140 + Math.random() * 40, stepTime);

                gain.gain.setValueAtTime(0.0001, stepTime);
                gain.gain.exponentialRampToValueAtTime(0.18, stepTime + 0.003);
                gain.gain.exponentialRampToValueAtTime(0.0001, stepTime + 0.022);

                osc.connect(gain);
                gain.connect(this.masterGain);

                osc.start(stepTime);
                osc.stop(stepTime + 0.03);
            }
        } catch (err) {
            console.warn('[SoundEngine] Erro em playFloppySeek:', err);
        }
    },

    playMineExplode() {
        try {
            if (!this.canPlay()) return;
            const now = this.ctx.currentTime;

            const bufLen = Math.floor(this.ctx.sampleRate * 0.45);
            const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufLen; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.18));
            }

            const noise = this.ctx.createBufferSource();
            noise.buffer = buf;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(500, now);
            filter.frequency.exponentialRampToValueAtTime(60, now + 0.45);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);

            noise.start(now);
        } catch (err) {
            console.warn('[SoundEngine] Erro em playMineExplode:', err);
        }
    },

    playWinFanfare() {
        try {
            if (!this.canPlay()) return;
            const now = this.ctx.currentTime;
            const notes = [
                { f: 523.25, t: 0.0, d: 0.12 },
                { f: 659.25, t: 0.12, d: 0.12 },
                { f: 783.99, t: 0.24, d: 0.12 },
                { f: 1046.50, t: 0.36, d: 0.35 }
            ];

            notes.forEach(n => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(n.f, now + n.t);

                gain.gain.setValueAtTime(0.0001, now + n.t);
                gain.gain.exponentialRampToValueAtTime(0.24, now + n.t + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);

                osc.connect(gain);
                gain.connect(this.masterGain);

                osc.start(now + n.t);
                osc.stop(now + n.t + n.d + 0.02);
            });
        } catch (err) {
            console.warn('[SoundEngine] Erro em playWinFanfare:', err);
        }
    }
};

// Autoplay unlock no primeiro gesto do usuário
const unlockAudioOnGesture = () => {
    SoundEngine.unlock().then(() => {
        const savedPref = localStorage.getItem('retro_show_tips');
        const tipsDisabled = savedPref === 'false';
        if (tipsDisabled && !SoundEngine.hasPlayedStartup && SoundEngine.canPlay()) {
            SoundEngine.hasPlayedStartup = true;
            SoundEngine.playStartupJingle();
        }
    });
    window.removeEventListener('pointerdown', unlockAudioOnGesture);
    window.removeEventListener('keydown', unlockAudioOnGesture);
};
window.addEventListener('pointerdown', unlockAudioOnGesture, { passive: true });
window.addEventListener('keydown', unlockAudioOnGesture, { passive: true });

// Redireciona getRetroAudio() para SoundEngine
const getRetroAudio = () => SoundEngine;

// ============================================================
// 1. WINDOW MANAGER: MULTI-JANELAS, Z-INDEX, ARRASTE & REDIMENSIONAMENTO
// ============================================================
const WindowManager = {
    highestZ: 100,
    openApps: new Map(),
    activeAppId: null,

    init() {
        document.querySelectorAll('.explorer-window, .win-dialog').forEach(win => {
            const titlebar = win.querySelector('.window-titlebar');
            const btnClose = win.querySelector('.btn-win-close');
            const btnMin = win.querySelector('.btn-win-minimize');
            const btnMax = win.querySelector('.btn-win-maximize');

            win.addEventListener('pointerdown', (e) => {
                if (!e.target.closest('.btn-win-ctrl')) {
                    this.focusWindow(win.dataset.appId);
                }
            });

            if (titlebar) {
                this.setupDraggable(win, titlebar);
            }

            if (btnClose) {
                btnClose.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (window.RetroOS && window.RetroOS.Kernel) {
                        window.RetroOS.Kernel.killByElement(win);
                    }
                    this.closeWindow(win.dataset.appId);
                });
            }

            if (btnMin) {
                btnMin.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.minimizeWindow(win.dataset.appId);
                });
            }

            if (btnMax) {
                btnMax.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleMaximize(win.dataset.appId);
                });
            }

            win.querySelectorAll('.menu-item').forEach(mi => {
                const dropdown = mi.querySelector('.menu-dropdown');
                if (dropdown) {
                    mi.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const wasOpen = !dropdown.classList.contains('is-hidden') && dropdown.classList.contains('is-active');
                        this.closeAllMenuDropdowns();
                        if (!wasOpen) {
                            dropdown.classList.remove('is-hidden');
                            dropdown.classList.add('is-active');
                            mi.classList.add('is-open');
                        }
                    });
                }
            });
        });

        document.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('.window-menubar')) {
                this.closeAllMenuDropdowns();
            }
            if (!e.target.closest('#start-menu') && !e.target.closest('#btn-start')) {
                this.closeStartMenu();
            }
            if (!e.target.closest('.context-menu')) {
                DesktopManager.hideContextMenus();
            }
            if (!e.target.closest('#tray-vol-popup') && !e.target.closest('#tray-vol-btn')) {
                const p = document.getElementById('tray-vol-popup');
                if (p) p.classList.add('is-hidden');
            }
        });
    },

    closeAllMenuDropdowns() {
        document.querySelectorAll('.menu-dropdown').forEach(d => {
            d.classList.add('is-hidden');
            d.classList.remove('is-active');
        });
        document.querySelectorAll('.menu-item.is-open').forEach(m => m.classList.remove('is-open'));
    },

    openWindow(appId, param = '') {
        SoundEngine.playWindowOpen();
        this.closeStartMenu();
        DesktopManager.hideContextMenus();

        if (appId === 'contato') appId = 'mail';
        if (appId === 'sysdm' || appId === 'system' || appId === 'about' || appId === 'sysdm.cpl') appId = 'about';
        if (appId === 'specs' && !param) appId = 'about';
        let win = document.querySelector(`[data-app-id="${appId}"]`);
        if (!win) {
            if (appId === 'projetos' || appId === 'sobre' || appId === 'specs') {
                win = document.getElementById('explorer');
                param = appId;
                appId = 'explorer';
            }
        }
        if (!win) return;

        win.classList.remove('is-hidden');

        // Cria ou recupera a aba na barra de tarefas
        let tab = document.querySelector(`.taskbar-tab[data-app-id="${appId}"]`);
        if (!tab) {
            const taskContainer = document.getElementById('taskbar-tasks');
            tab = document.createElement('button');
            tab.className = 'taskbar-tab is-active';
            tab.dataset.appId = appId;

            const iconClass = this.getAppIconClass(appId);
            const titleText = this.getAppTitle(appId, param);
            tab.innerHTML = `<span class="taskbar-tab-icon ${iconClass}"></span><span class="taskbar-tab-title">${titleText}</span>`;

            tab.addEventListener('click', () => {
                if (this.activeAppId === appId && !win.classList.contains('is-hidden')) {
                    this.minimizeWindow(appId);
                } else {
                    this.openWindow(appId, param);
                }
            });

            taskContainer.appendChild(tab);
        } else {
            tab.classList.remove('is-hidden');
            tab.classList.add('is-active');
        }

        // Sincroniza botão legado do explorer
        if (appId === 'explorer') {
            const legacyBtn = document.getElementById('taskbar-win-btn');
            if (legacyBtn) {
                legacyBtn.classList.remove('is-hidden');
                legacyBtn.classList.add('is-active');
                const t = document.getElementById('taskbar-win-title');
                if (t) t.textContent = this.getAppTitle('explorer', param);
            }
        }

        this.openApps.set(appId, { win, tab, isMin: false });
        if (window.innerWidth <= 768) {
            win.classList.add('is-maximized');
            win.style.transform = 'translate3d(0px, 0px, 0px)';
        } else {
            this.centerWindow(win);
        }
        this.focusWindow(appId);

        // Spawn e rastreamento do processo no Kernel do RetroOS
        const proc = window.RetroOS && window.RetroOS.Kernel ? window.RetroOS.Kernel.spawn(appId, win) : null;

        if (appId === 'explorer') {
            ExplorerApp.showView(param || 'projetos');
        } else if (appId === 'notepad') {
            NotepadApp.loadDocument(param);
        } else if (appId === 'paint') {
            PaintApp.init();
        } else if (appId === 'snake') {
            SnakeApp.init(proc);
        } else if (appId === 'calc') {
            CalcApp.init();
        } else if (appId === 'display') {
            DisplayApp.init();
        } else if (appId === 'taskmgr') {
            TaskMgrApp.render(proc);
        } else if (appId === 'datetime') {
            DateTimeApp.init(proc);
        } else if (appId === 'mail') {
            MailApp.init(proc);
        } else if (appId === 'about') {
            SystemPropertiesApp.init(proc);
        }
    },

    closeWindow(appId) {
        SoundEngine.playWindowClose();
        const win = document.querySelector(`[data-app-id="${appId}"]`);
        if (win) {
            if (window.RetroOS && window.RetroOS.Kernel) {
                window.RetroOS.Kernel.killByElement(win);
            } else {
                win.classList.add('is-hidden');
            }
        }

        const tab = document.querySelector(`.taskbar-tab[data-app-id="${appId}"]`);
        if (tab) {
            if (tab.id === 'taskbar-win-btn') {
                tab.classList.add('is-hidden');
            } else {
                tab.remove();
            }
        }

        if (appId === 'explorer') {
            const legacyBtn = document.getElementById('taskbar-win-btn');
            if (legacyBtn) {
                legacyBtn.classList.add('is-hidden');
                legacyBtn.classList.remove('is-active');
            }
        }

        if (appId === 'snake') {
            SnakeApp.stop();
        } else if (appId === 'mail') {
            MailApp.close();
        }

        this.openApps.delete(appId);

        const remaining = Array.from(this.openApps.keys());
        if (remaining.length > 0) {
            this.focusWindow(remaining[remaining.length - 1]);
        } else {
            this.activeAppId = null;
        }
    },

    minimizeWindow(appId) {
        getRetroAudio().playClick('subtle');
        const entry = this.openApps.get(appId);
        if (!entry) return;

        entry.win.classList.add('is-hidden');
        entry.tab.classList.remove('is-active');
        entry.isMin = true;

        if (appId === 'explorer') {
            const legacyBtn = document.getElementById('taskbar-win-btn');
            if (legacyBtn) legacyBtn.classList.remove('is-active');
        }

        if (this.activeAppId === appId) {
            const nextActive = Array.from(this.openApps.entries()).find(([id, data]) => id !== appId && !data.isMin);
            if (nextActive) this.focusWindow(nextActive[0]);
            else this.activeAppId = null;
        }
    },

    toggleMaximize(appId) {
        if (window.innerWidth <= 768) return; // Em mobile (< 768px), janelas operam sempre em tela cheia
        getRetroAudio().playClick('subtle');
        const win = document.querySelector(`[data-app-id="${appId}"]`);
        if (!win) return;

        const btnMax = win.querySelector('.btn-win-maximize');
        const isMax = win.classList.toggle('is-maximized');
        if (btnMax) {
            btnMax.textContent = isMax ? '❐' : '□';
            btnMax.title = isMax ? 'Restaurar' : 'Maximizar';
        }

        if (isMax) {
            win.style.transform = 'translate3d(0px, 0px, 0px)';
        } else {
            // Restauração: preserva e restaura exatamente para a última coordenada calculada no translate3d
            const posX = win.dataset.posX || 20;
            const posY = win.dataset.posY || 20;
            win.style.transform = `translate3d(${posX}px, ${posY}px, 0px)`;
        }
    },

    focusWindow(appId) {
        const win = document.querySelector(`[data-app-id="${appId}"]`);
        if (!win) return;

        this.highestZ += 2;
        win.style.zIndex = this.highestZ;

        document.querySelectorAll('.explorer-window, .win-dialog').forEach(w => w.classList.remove('is-focused'));
        win.classList.add('is-focused');

        document.querySelectorAll('.taskbar-tab').forEach(t => t.classList.remove('is-active'));
        const tab = document.querySelector(`.taskbar-tab[data-app-id="${appId}"]`);
        if (tab) tab.classList.add('is-active');

        if (appId === 'explorer') {
            const legacyBtn = document.getElementById('taskbar-win-btn');
            if (legacyBtn) legacyBtn.classList.add('is-active');
        }

        this.activeAppId = appId;
        const entry = this.openApps.get(appId);
        if (entry) entry.isMin = false;
    },

    centerWindow(win) {
        if (window.innerWidth <= 768) {
            win.classList.add('is-maximized');
            win.style.transform = 'translate3d(0px, 0px, 0px)';
            return;
        }

        if (!win.dataset.hasMoved) {
            const offset = (this.openApps.size * 22) % 120;
            const winW = win.offsetWidth || 560;
            const winH = win.offsetHeight || 420;
            const x = Math.max(10, Math.round((window.innerWidth - winW) / 2 + offset - 40));
            const y = Math.max(10, Math.round((window.innerHeight - 44 - winH) / 2 + offset - 40));

            win.dataset.posX = x;
            win.dataset.posY = y;
            win.style.left = '0px';
            win.style.top = '0px';
            win.style.transform = `translate3d(${x}px, ${y}px, 0px)`;
        }
    },

    closeAll() {
        this.openApps.forEach((data, id) => {
            this.closeWindow(id);
        });
    },

    toggleStartMenu() {
        getRetroAudio().playClick();
        const startMenu = document.getElementById('start-menu');
        const btnStart = document.getElementById('btn-start');
        if (!startMenu || !btnStart) return;

        const isOpen = !startMenu.classList.contains('is-hidden');
        if (isOpen) {
            this.closeStartMenu();
        } else {
            startMenu.classList.remove('is-hidden');
            btnStart.classList.add('is-pressed');
            btnStart.setAttribute('aria-expanded', 'true');
        }
    },

    closeStartMenu() {
        const startMenu = document.getElementById('start-menu');
        const btnStart = document.getElementById('btn-start');
        if (startMenu) startMenu.classList.add('is-hidden');
        if (btnStart) {
            btnStart.classList.remove('is-pressed');
            btnStart.setAttribute('aria-expanded', 'false');
        }
        document.querySelectorAll('.start-flyout-menu').forEach(m => m.classList.add('is-hidden'));
    },

    setupDraggable(win, titlebar) {
        let isDragging = false;
        let startPointerX, startPointerY;
        let startPosX = 0, startPosY = 0;
        let currentX = 0, currentY = 0;
        let rafId = null;

        titlebar.addEventListener('pointerdown', (e) => {
            // Desativa arraste em telas menores que 768px (Mobile) para evitar desalinhamento,
            // ou se botão de controle for clicado, ou se janela estiver maximizada
            if (window.innerWidth <= 768 || e.target.closest('button') || e.target.closest('.btn-win-ctrl') || win.classList.contains('is-maximized')) {
                return;
            }

            isDragging = true;
            win.dataset.hasMoved = 'true';
            this.focusWindow(win.dataset.appId);

            if (win.dataset.posX !== undefined && win.dataset.posY !== undefined) {
                startPosX = parseFloat(win.dataset.posX) || 0;
                startPosY = parseFloat(win.dataset.posY) || 0;
            } else {
                const rect = win.getBoundingClientRect();
                startPosX = rect.left;
                startPosY = rect.top;
                win.dataset.posX = startPosX;
                win.dataset.posY = startPosY;
            }

            startPointerX = e.clientX;
            startPointerY = e.clientY;
            currentX = startPosX;
            currentY = startPosY;

            try { titlebar.setPointerCapture(e.pointerId); } catch (err) { }
            e.preventDefault();
        });

        const updateTransform = () => {
            if (!isDragging) return;
            win.style.transform = `translate3d(${Math.round(currentX)}px, ${Math.round(currentY)}px, 0px)`;
            win.dataset.posX = Math.round(currentX);
            win.dataset.posY = Math.round(currentY);
            rafId = null;
        };

        titlebar.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            if (window.innerWidth <= 768) {
                isDragging = false;
                return;
            }

            const dx = e.clientX - startPointerX;
            const dy = e.clientY - startPointerY;

            const maxX = window.innerWidth - win.offsetWidth;
            const maxY = window.innerHeight - 44 - 30;

            currentX = Math.max(0, Math.min(maxX, startPosX + dx));
            currentY = Math.max(0, Math.min(maxY, startPosY + dy));

            // Isole as atualizações visuais dentro de requestAnimationFrame para evitar Layout Thrashing
            if (rafId === null) {
                rafId = requestAnimationFrame(updateTransform);
            }
        });

        const finish = (e) => {
            if (!isDragging) return;
            isDragging = false;
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                updateTransform();
            }
            try { titlebar.releasePointerCapture(e.pointerId); } catch (err) { }
        };

        titlebar.addEventListener('pointerup', finish);
        titlebar.addEventListener('pointercancel', finish);
    },

    getAppIconClass(appId) {
        const map = {
            explorer: 'icon-folder-sm',
            notepad: 'icon-notepad-sm',
            paint: 'icon-paint-sm',
            snake: 'icon-snake-sm',
            calc: 'icon-calc-sm',
            display: 'icon-display-sm',
            taskmgr: 'icon-taskmgr-sm',
            run: 'icon-run-sm',
            shutdown: 'icon-shutdown-sm',
            datetime: 'icon-clock-sm',
            specs: 'icon-specs-sm',
            about: 'icon-specs-sm',
            sysdm: 'icon-specs-sm',
            mail: 'icon-mail-sm'
        };
        return map[appId] || 'icon-folder-sm';
    },

    getAppTitle(appId, param) {
        if (appId === 'about' || appId === 'sysdm') return 'Propriedades do Sistema';
        if (appId === 'explorer') {
            if (param === 'mycomputer') return 'Meu Computador';
            if (param === 'specs') return 'Hardware & Sistema';
            if (param === 'sobre') return 'Sobre o Sistema';
            if (param === 'trash') return 'Lixeira';
            return 'Meus Projetos';
        }
        if (appId === 'notepad') return param === 'sobre' ? 'Sobre.txt - Bloco de Notas' : 'Bloco de Notas';
        if (appId === 'paint') return 'Paint';
        if (appId === 'snake') return 'Cobrinha - Windows 95';
        if (appId === 'calc') return 'Calculadora';
        if (appId === 'display') return 'Propriedades de Vídeo';
        if (appId === 'taskmgr') return 'Gerenciador de Tarefas';
        if (appId === 'datetime') return 'Data e Hora';
        if (appId === 'mail') return 'Nova Mensagem';
        return appId.toUpperCase();
    }
};

// ============================================================
// 2. DESKTOP MANAGER: ATALHOS, SELEÇÃO MARQUEE & MENUS DE CONTEXTO
// ============================================================
const DesktopManager = {
    init() {
        const desktop = document.getElementById('retro-desktop');
        const marquee = document.getElementById('desktop-marquee');
        let isMarquee = false;
        let startX, startY;
        let lastClickTime = 0;
        let lastClickedId = null;

        function launchShortcut(sc) {
            getRetroAudio().playClick();
            const app = sc.dataset.app;
            const target = sc.dataset.target;
            const param = sc.dataset.param;

            if (target === 'sobre' || target === 'projetos' || target === 'specs' || target === 'mycomputer' || target === 'trash') {
                WindowManager.openWindow('explorer', target);
            } else if (app === 'explorer') {
                WindowManager.openWindow('explorer', param || target || 'mycomputer');
            } else if (app === 'notepad') {
                WindowManager.openWindow('notepad', param || '');
            } else if (app === 'paint') {
                WindowManager.openWindow('paint');
            } else if (app === 'snake') {
                WindowManager.openWindow('snake');
            } else if (app === 'calc') {
                WindowManager.openWindow('calc');
            } else if (app === 'display') {
                WindowManager.openWindow('display');
            } else if (app) {
                WindowManager.openWindow(app, param || '');
            } else if (target) {
                WindowManager.openWindow('explorer', target);
            }
        }

        this.bindShortcuts(launchShortcut);

        // Menus de Contexto
        if (desktop) {
            desktop.addEventListener('contextmenu', (e) => {
                if (e.target === desktop || e.target.classList.contains('desktop-icons-grid')) {
                    e.preventDefault();
                    this.showDesktopContextMenu(e.clientX, e.clientY);
                }
            });
        }

        const taskbar = document.getElementById('retro-taskbar');
        if (taskbar) {
            taskbar.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showTaskbarContextMenu(e.clientX, e.clientY);
            });
        }

        // Submenus com isolamento perfeito de hover
        this.setupSubmenus();

        // Marquee de seleção na área de trabalho
        if (desktop) {
            desktop.addEventListener('pointerdown', (e) => {
                if (e.target === desktop || e.target.classList.contains('desktop-icons-grid')) {
                    document.querySelectorAll('.desktop-shortcut').forEach(s => s.classList.remove('is-selected'));
                    this.hideContextMenus();

                    isMarquee = true;
                    const rect = desktop.getBoundingClientRect();
                    startX = e.clientX - rect.left;
                    startY = e.clientY - rect.top;

                    if (marquee) {
                        marquee.style.left = `${startX}px`;
                        marquee.style.top = `${startY}px`;
                        marquee.style.width = '0px';
                        marquee.style.height = '0px';
                        marquee.classList.remove('is-hidden');
                    }
                }
            });
        }

        window.addEventListener('pointermove', (e) => {
            if (!isMarquee || !marquee || !desktop) return;
            const rect = desktop.getBoundingClientRect();
            const curX = e.clientX - rect.left;
            const curY = e.clientY - rect.top;

            const left = Math.min(startX, curX);
            const top = Math.min(startY, curY);
            const width = Math.abs(curX - startX);
            const height = Math.abs(curY - startY);

            marquee.style.left = `${left}px`;
            marquee.style.top = `${top}px`;
            marquee.style.width = `${width}px`;
            marquee.style.height = `${height}px`;

            const mBox = { left, top, right: left + width, bottom: top + height };
            document.querySelectorAll('.desktop-shortcut').forEach(sc => {
                const sRect = sc.getBoundingClientRect();
                const scBox = {
                    left: sRect.left - rect.left,
                    top: sRect.top - rect.top,
                    right: sRect.right - rect.left,
                    bottom: sRect.bottom - rect.top
                };

                const intersect = !(scBox.left > mBox.right || scBox.right < mBox.left || scBox.top > mBox.bottom || scBox.bottom < mBox.top);
                sc.classList.toggle('is-selected', intersect);
            });
        });

        window.addEventListener('pointerup', () => {
            if (isMarquee) {
                isMarquee = false;
                if (marquee) marquee.classList.add('is-hidden');
            }
        });

        // Ações dos Menus de Contexto
        this.setupContextMenuActions();
    },

    bindShortcuts(launchFn) {
        let lastClickTime = 0;
        let lastClickedId = null;
        let lastLaunchTime = 0;
        let lastLaunchId = null;

        const guardedLaunch = (sc) => {
            // Debounce: click(isDouble) + dblclick disparam em sequência no duplo clique real.
            // Ignora o segundo disparo dentro de 600ms para o mesmo ícone.
            const now = Date.now();
            const key = sc.id || sc.dataset.app + ':' + (sc.dataset.param || sc.dataset.target || '');
            if (key === lastLaunchId && (now - lastLaunchTime < 600)) {
                return;
            }
            lastLaunchTime = now;
            lastLaunchId = key;
            launchFn(sc);
        };

        document.querySelectorAll('.desktop-shortcut').forEach(sc => {
            sc.addEventListener('click', (e) => {
                e.stopPropagation();
                const now = Date.now();
                const isDouble = (now - lastClickTime < 450) && (lastClickedId === sc.id);
                lastClickTime = now;
                lastClickedId = sc.id;

                document.querySelectorAll('.desktop-shortcut').forEach(s => s.classList.remove('is-selected'));
                sc.classList.add('is-selected');

                if (isDouble || e.isTrusted === false) {
                    guardedLaunch(sc);
                }
            });

            sc.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                guardedLaunch(sc);
            });

            sc.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    guardedLaunch(sc);
                }
            });

            sc.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showIconContextMenu(e.clientX, e.clientY, sc);
            });
        });
    },

    setupSubmenus() {
        const arrangeItem = document.getElementById('ctx-dt-arrange');
        const newItem = document.getElementById('ctx-dt-new');
        const arrangeSub = document.getElementById('ctx-dt-arrange-sub');
        const newSub = document.getElementById('ctx-dt-new-sub');

        if (arrangeItem && arrangeSub) {
            arrangeItem.addEventListener('mouseenter', () => {
                if (newSub) newSub.classList.add('is-hidden');
                arrangeSub.classList.remove('is-hidden');
            });
        }

        if (newItem && newSub) {
            newItem.addEventListener('mouseenter', () => {
                if (arrangeSub) arrangeSub.classList.add('is-hidden');
                newSub.classList.remove('is-hidden');
            });
        }

        document.querySelectorAll('#ctx-dt-grid, #ctx-dt-refresh, #ctx-dt-props').forEach(item => {
            item.addEventListener('mouseenter', () => {
                if (arrangeSub) arrangeSub.classList.add('is-hidden');
                if (newSub) newSub.classList.add('is-hidden');
            });
        });
    },

    setupContextMenuActions() {
        const refreshItem = document.getElementById('ctx-dt-refresh');
        if (refreshItem) {
            refreshItem.addEventListener('click', () => {
                getRetroAudio().playClick('subtle');
                const dt = document.getElementById('retro-desktop');
                if (dt) {
                    dt.style.opacity = '0.5';
                    setTimeout(() => { dt.style.opacity = '1'; }, 100);
                }
                this.hideContextMenus();
            });
        }

        const propsItem = document.getElementById('ctx-dt-props');
        if (propsItem) {
            propsItem.addEventListener('click', () => {
                this.hideContextMenus();
                WindowManager.openWindow('display');
            });
        }

        // Organizar Ícones por Nome
        const sortName = document.getElementById('ctx-dt-sort-name');
        if (sortName) {
            sortName.addEventListener('click', () => {
                this.sortIcons((a, b) => {
                    const tA = a.querySelector('.shortcut-label')?.textContent || '';
                    const tB = b.querySelector('.shortcut-label')?.textContent || '';
                    return tA.localeCompare(tB);
                });
                this.hideContextMenus();
            });
        }

        // Organizar Ícones por Tipo
        const sortType = document.getElementById('ctx-dt-sort-type');
        if (sortType) {
            sortType.addEventListener('click', () => {
                this.sortIcons((a, b) => {
                    const appA = a.dataset.app || '';
                    const appB = b.dataset.app || '';
                    return appA.localeCompare(appB);
                });
                this.hideContextMenus();
            });
        }

        // Auto-organizar
        const sortAuto = document.getElementById('ctx-dt-sort-auto');
        if (sortAuto) {
            sortAuto.addEventListener('click', () => {
                getRetroAudio().playClick('subtle');
                const grid = document.getElementById('desktop-icons-grid');
                if (grid) {
                    grid.style.transform = 'scale(0.98)';
                    setTimeout(() => { grid.style.transform = 'scale(1)'; }, 100);
                }
                this.hideContextMenus();
            });
        }

        // Novo -> Pasta
        const newFolder = document.getElementById('ctx-dt-new-folder');
        if (newFolder) {
            newFolder.addEventListener('click', () => {
                this.createDesktopItem('folder', 'Nova Pasta');
                this.hideContextMenus();
            });
        }

        // Novo -> Documento de Texto
        const newTxt = document.getElementById('ctx-dt-new-txt');
        if (newTxt) {
            newTxt.addEventListener('click', () => {
                this.createDesktopItem('txt', 'Novo Documento.txt');
                this.hideContextMenus();
            });
        }

        // Novo -> Imagem de Bitmap
        const newBmp = document.getElementById('ctx-dt-new-bmp');
        if (newBmp) {
            newBmp.addEventListener('click', () => {
                this.createDesktopItem('bmp', 'Nova Imagem.bmp');
                this.hideContextMenus();
            });
        }
    },

    sortIcons(sortFn) {
        getRetroAudio().playClick('subtle');
        const grid = document.getElementById('desktop-icons-grid');
        if (!grid) return;
        const icons = Array.from(grid.querySelectorAll('.desktop-shortcut'));
        icons.sort(sortFn);
        icons.forEach(ic => grid.appendChild(ic));
    },

    createDesktopItem(type, label) {
        getRetroAudio().playClick('subtle');
        const grid = document.getElementById('desktop-icons-grid');
        if (!grid) return;

        const btn = document.createElement('button');
        btn.className = 'desktop-shortcut';

        let iconClass = 'icon-folder';
        let app = 'explorer';
        let param = 'projetos';

        if (type === 'txt') {
            iconClass = 'icon-text-doc';
            app = 'notepad';
            param = '';
        } else if (type === 'bmp') {
            iconClass = 'icon-paint';
            app = 'paint';
            param = '';
        }

        btn.dataset.app = app;
        btn.dataset.param = param;
        btn.innerHTML = `<div class="shortcut-icon ${iconClass}"></div><span class="shortcut-label">${label}</span>`;

        grid.appendChild(btn);
        this.bindShortcuts((sc) => {
            if (sc.dataset.app === 'notepad') WindowManager.openWindow('notepad', sc.dataset.param);
            else if (sc.dataset.app === 'paint') WindowManager.openWindow('paint');
            else WindowManager.openWindow('explorer', sc.dataset.param || 'projetos');
        });
    },

    showDesktopContextMenu(x, y) {
        this.hideContextMenus();
        const menu = document.getElementById('ctx-desktop');
        if (!menu) return;

        const posX = Math.min(window.innerWidth - 180, x);
        const posY = Math.min(window.innerHeight - 220, y);

        menu.style.left = `${posX}px`;
        menu.style.top = `${posY}px`;
        menu.classList.remove('is-hidden');
    },

    showIconContextMenu(x, y, iconEl) {
        this.hideContextMenus();
        const menu = document.getElementById('ctx-icon');
        if (!menu) return;

        const posX = Math.min(window.innerWidth - 180, x);
        const posY = Math.min(window.innerHeight - 200, y);

        menu.style.left = `${posX}px`;
        menu.style.top = `${posY}px`;
        menu.classList.remove('is-hidden');

        const openBtn = document.getElementById('ctx-ic-open');
        if (openBtn) {
            openBtn.onclick = () => {
                this.hideContextMenus();
                const target = iconEl.dataset.target;
                const app = iconEl.dataset.app;
                const param = iconEl.dataset.param;
                if (app === 'notepad') WindowManager.openWindow('notepad', param);
                else if (app && app !== 'explorer') WindowManager.openWindow(app, param);
                else if (target) WindowManager.openWindow('explorer', target);
                else WindowManager.openWindow('explorer', param || 'projetos');
            };
        }

        const propsBtn = document.getElementById('ctx-ic-props');
        if (propsBtn) {
            propsBtn.onclick = () => {
                this.hideContextMenus();
                if (iconEl.id === 'icon-mycomputer' || iconEl.id === 'icon-specs' || iconEl.dataset.app === 'about') {
                    WindowManager.openWindow('about');
                } else {
                    WindowManager.openWindow('display');
                }
            };
        }
    },

    showTaskbarContextMenu(x, y) {
        this.hideContextMenus();
        const menu = document.getElementById('ctx-taskbar');
        if (!menu) return;

        const posX = Math.min(window.innerWidth - 180, x);
        const posY = Math.min(window.innerHeight - 160, y - 140);

        menu.style.left = `${posX}px`;
        menu.style.top = `${posY}px`;
        menu.classList.remove('is-hidden');

        const tmItem = document.getElementById('ctx-tb-taskmgr');
        if (tmItem) {
            tmItem.onclick = () => {
                this.hideContextMenus();
                WindowManager.openWindow('taskmgr');
            };
        }

        const propsItem = document.getElementById('ctx-tb-props');
        if (propsItem) {
            propsItem.onclick = () => {
                this.hideContextMenus();
                WindowManager.openWindow('display');
            };
        }
    },

    hideContextMenus() {
        document.querySelectorAll('.context-menu').forEach(m => m.classList.add('is-hidden'));
        document.querySelectorAll('.context-submenu').forEach(s => s.classList.add('is-hidden'));
    }
};

// ============================================================
// 3. APLICATIVOS CLÁSSICOS INTEGRADOS
// ============================================================

// Dados Estruturados de Projetos com Metadados Reais e Arquitetura Técnica
const PROJECTS_DATA = [
    {
        id: 'workstation-3d',
        fileName: 'WORKSTATION.EXE',
        title: '3D Retro Workstation',
        ext: '.EXE',
        size: '2.40 MB',
        date: '04/09/1995',
        type: 'Aplicativo Win32 (x86)',
        iconClass: 'icon-file-exe',
        badge: 'THREE.JS / WEBGL',
        previewIcon: '🕹️',
        desc: 'Estação vintage interativa recriando um setup de computador anos 90 com monitor de tubo em perspectiva 3D livre e iluminação de estúdio refinada.',
        arch: 'Engine 3D em Three.js com OrbitControls calibrado, render loop otimizado com throttling a 30 FPS no modo SO e descarte profundo de VRAM via disposeHierarchy.',
        stack: ['Three.js', 'WebGL', 'GLSL Shaders', 'Web Audio API', 'JavaScript ES6'],
        actionLabel: 'Reiniciar Boot 3D',
        actionType: 'boot3d',
        repoUrl: USER_PROFILE.github
    },
    {
        id: 'retro-os',
        fileName: 'RETRO-OS.SYS',
        title: 'Windows 95/98 GUI System',
        ext: '.SYS',
        size: '1.84 MB',
        date: '24/08/1995',
        type: 'Driver / Shell do Sistema',
        iconClass: 'icon-file-sys',
        badge: 'KERNEL MULTI-TASK',
        previewIcon: '🖥️',
        desc: 'Simulador multitarefa autêntico do Windows 95/98 com gerenciador de janelas, barra de tarefas, menu Iniciar, gerenciador de processos e suporte a temas.',
        arch: 'Process Table formal com hook onDestroy(), prevenção rigorosa de vazamentos de memória (zero timers/listeners zumbis) e arrasto com hardware acceleration via translate3d.',
        stack: ['DOM API', 'CSS Double-Bevel', 'Kernel / Process Table', 'Mobile Viewport'],
        actionLabel: 'Hardware & Sistema',
        actionType: 'specs',
        repoUrl: USER_PROFILE.github
    },
    {
        id: 'crt-vfx',
        fileName: 'CRT-FILTER.GLSL',
        title: 'CRT Scanlines & Phosphor VFX',
        ext: '.GLSL',
        size: '420 KB',
        date: '15/11/1996',
        type: 'Shader / Pós-Processamento',
        iconClass: 'icon-file-code',
        badge: 'WCAG AA COMPLIANT',
        previewIcon: '⚡',
        desc: 'Simulação analógica de monitor CRT com rasterização de scanlines horizontais, vinheta esférica e máscara fosfórica RGB.',
        arch: 'Camada não-destrutiva com 3 modos de exibição (Desligado, Sutil com 4% alfa em conformidade estrita WCAG AA, e Tubo Autêntico com vinheta curva e persistência local).',
        stack: ['GLSL', 'CSS Blend Modes', 'Color Luminance', 'Acessibilidade'],
        actionLabel: 'Configurar Efeito CRT',
        actionType: 'display',
        repoUrl: USER_PROFILE.github
    },
    {
        id: 'snake-game',
        fileName: 'SNAKE95.EXE',
        title: 'Cobrinha Arcade Retrô',
        ext: '.EXE',
        size: '310 KB',
        date: '12/03/1997',
        type: 'Jogo Interativo Win16/32',
        iconClass: 'icon-file-game',
        badge: 'ARCADE 60 FPS',
        previewIcon: '🐍',
        desc: 'Jogo Snake clássico com matriz LCD verde monocromática, display LED digital de 7 segmentos para placar e recorde persistente.',
        arch: 'Processo isolado no RetroOS Kernel com seletor dinâmico de velocidade (Fácil a Insano), colisão matricial e bipes de áudio Web Audio em tempo real.',
        stack: ['Canvas 2D', 'Algoritmos de Colisão', 'Web Audio Bleeps', 'LocalStorage'],
        actionLabel: 'Jogar Cobrinha',
        actionType: 'snake',
        repoUrl: USER_PROFILE.github
    },
    {
        id: 'paint-brush',
        fileName: 'PBRUSH.EXE',
        title: 'Paintbrush 95 Clone',
        ext: '.EXE',
        size: '512 KB',
        date: '28/06/1995',
        type: 'Editor de Imagens Raster',
        iconClass: 'icon-file-exe',
        badge: 'BITMAP 28 COLORS',
        previewIcon: '🎨',
        desc: 'Editor gráfico clássico com lápis, pincel, balde de preenchimento, borracha, formas geométricas, seletor de espessuras e paleta de 28 cores.',
        arch: 'Preenchimento de inundação por fila (Breadth-First Queue Flood Fill) direto no buffer ImageData do Canvas, e gerador de arquivos PNG para download.',
        stack: ['Canvas ImageData', 'Flood Fill BFS', 'Bresenham Lines', 'PNG Exporter'],
        actionLabel: 'Abrir MS Paint',
        actionType: 'paint',
        repoUrl: USER_PROFILE.github
    }
];

// 1. EXPLORER / MEU COMPUTADOR / MEUS PROJETOS
const ExplorerApp = {
    projects: PROJECTS_DATA,
    selectedProjectId: 'workstation-3d',

    init() {
        document.querySelectorAll('.item[data-nav]').forEach(item => {
            const activateNav = () => {
                const nav = item.dataset.nav;
                if (nav === 'projetos' || nav === 'specs' || nav === 'sobre' || nav === 'mycomputer' || nav === 'trash') {
                    ExplorerApp.showView(nav);
                } else if (nav === 'mail') {
                    WindowManager.openWindow('mail');
                } else if (nav === 'cdrom') {
                    getRetroAudio().playErrorSound();
                } else if (nav === 'floppy') {
                    getRetroAudio().playFloppySeek(4);
                }
            };
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.item').forEach(i => i.classList.remove('is-selected'));
                item.classList.add('is-selected');
            });
            item.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                activateNav();
            });
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    activateNav();
                }
            });
        });

        const emptyTrashBtn = document.getElementById('btn-empty-trash');
        if (emptyTrashBtn) {
            emptyTrashBtn.onclick = () => {
                getRetroAudio().playClick('subtle');
                emptyTrashBtn.textContent = 'Lixeira já está vazia';
                emptyTrashBtn.disabled = true;
            };
        }

        this.renderProjects();
        this.setupKeyboardNav();
    },

    setupKeyboardNav() {
        const listEl = document.getElementById('projects-files-list');
        if (!listEl) return;

        listEl.addEventListener('keydown', (e) => {
            const idx = this.projects.findIndex(p => p.id === this.selectedProjectId);
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextIdx = (idx + 1) % this.projects.length;
                this.selectProject(this.projects[nextIdx].id);
                const nextEl = listEl.querySelector(`[data-project-id="${this.projects[nextIdx].id}"]`);
                if (nextEl) nextEl.focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevIdx = (idx - 1 + this.projects.length) % this.projects.length;
                this.selectProject(this.projects[prevIdx].id);
                const prevEl = listEl.querySelector(`[data-project-id="${this.projects[prevIdx].id}"]`);
                if (prevEl) prevEl.focus();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const currentProj = this.projects.find(p => p.id === this.selectedProjectId);
                if (currentProj) this.runProjectAction(currentProj);
            }
        });
    },

    renderProjects() {
        const listEl = document.getElementById('projects-files-list');
        if (!listEl) return;

        listEl.innerHTML = '';
        this.projects.forEach(proj => {
            const row = document.createElement('div');
            row.className = 'project-file-item' + (proj.id === this.selectedProjectId ? ' is-selected' : '');
            row.dataset.projectId = proj.id;
            row.tabIndex = 0;
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', proj.id === this.selectedProjectId ? 'true' : 'false');

            row.innerHTML = `
                <div class="file-col-name">
                    <span class="file-icon ${proj.iconClass}" aria-hidden="true"></span>
                    <span>${proj.fileName}</span>
                </div>
                <div class="file-col-size">${proj.size}</div>
                <div class="file-col-type">${proj.type}</div>
            `;

            row.addEventListener('click', (e) => {
                e.stopPropagation();
                getRetroAudio().playClick('subtle');
                this.selectProject(proj.id);
            });

            row.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.runProjectAction(proj);
            });

            listEl.appendChild(row);
        });

        this.selectProject(this.selectedProjectId);
    },

    selectProject(id) {
        const proj = this.projects.find(p => p.id === id) || this.projects[0];
        if (!proj) return;
        this.selectedProjectId = proj.id;

        const listEl = document.getElementById('projects-files-list');
        if (listEl) {
            listEl.querySelectorAll('.project-file-item').forEach(item => {
                const isSel = item.dataset.projectId === proj.id;
                item.classList.toggle('is-selected', isSel);
                item.setAttribute('aria-selected', isSel ? 'true' : 'false');
            });
        }

        const detailsPanel = document.getElementById('projects-details-panel');
        if (detailsPanel) {
            detailsPanel.innerHTML = `
                <div class="project-preview-frame">
                    <span class="project-preview-placeholder">${proj.previewIcon}</span>
                    <span class="project-preview-badge">${proj.badge}</span>
                </div>
                <div class="project-details-meta">
                    <h3 class="project-details-title">${proj.title}</h3>
                    <span class="project-details-type">${proj.fileName} • ${proj.type} • ${proj.size}</span>
                </div>
                <p class="project-details-desc">${proj.desc}</p>
                <div class="project-details-arch">
                    <strong>Arquitetura Técnica:</strong> ${proj.arch}
                </div>
                <div class="project-tech-chips">
                    ${proj.stack.map(s => `<span class="tech-chip">${s}</span>`).join('')}
                </div>
                <div class="project-actions-row">
                    <button class="btn-retro btn-default btn-project-run" id="btn-proj-run" title="${proj.actionLabel}">${proj.actionLabel}</button>
                    <a href="${proj.repoUrl}" target="_blank" rel="noopener noreferrer" class="btn-retro btn-project-code" style="text-decoration:none;" title="Ver código no GitHub">GitHub ↗</a>
                </div>
            `;

            const runBtn = detailsPanel.querySelector('#btn-proj-run');
            if (runBtn) {
                runBtn.onclick = () => this.runProjectAction(proj);
            }
        }

        const statusEl = document.getElementById('explorer-status');
        if (statusEl) {
            statusEl.textContent = `1 objeto(s) selecionado(s) (${proj.fileName}) - ${proj.size}`;
        }
    },

    runProjectAction(proj) {
        getRetroAudio().playClick();
        if (proj.actionType === 'snake') {
            WindowManager.openWindow('snake');
        } else if (proj.actionType === 'paint') {
            WindowManager.openWindow('paint');
        } else if (proj.actionType === 'display') {
            WindowManager.openWindow('display');
        } else if (proj.actionType === 'mail') {
            WindowManager.openWindow('mail');
        } else if (proj.actionType === 'specs') {
            ExplorerApp.showView('specs');
        } else if (proj.actionType === 'boot3d') {
            if (typeof window.powerOffMachine === 'function') {
                window.powerOffMachine();
                setTimeout(() => {
                    if (typeof window.powerOnToIdle === 'function') window.powerOnToIdle();
                }, 800);
            } else if (typeof window.shutdownTo3D === 'function') {
                window.shutdownTo3D();
            }
        } else if (proj.repoUrl) {
            window.open(proj.repoUrl, '_blank');
        }
    },

    showView(name) {
        document.querySelectorAll('.explorer-view').forEach(v => {
            v.classList.toggle('is-active', v.id === `view-${name}`);
        });

        const titleText = document.getElementById('window-title-text');
        const pathText = document.querySelector('.path-display');
        const backBtn = document.getElementById('btn-folder-back');

        // O campo de endereço é um <input>: atualizar .value (e textContent como fallback).
        const setPath = (val) => {
            if (!pathText) return;
            if ('value' in pathText) pathText.value = val;
            pathText.textContent = val;
            pathText.setAttribute('value', val);
        };

        if (name === 'mycomputer') {
            if (titleText) titleText.textContent = 'Meu Computador';
            setPath('C:\\');
            if (backBtn) backBtn.style.display = 'none';
        } else if (name === 'projetos') {
            if (titleText) titleText.textContent = 'Meus Projetos';
            setPath('C:\\DESKTOP\\PROJETOS');
            if (backBtn) backBtn.style.display = 'inline-block';
            this.renderProjects();
        } else if (name === 'sobre') {
            if (titleText) titleText.textContent = 'Sobre o Sistema';
            setPath('C:\\DESKTOP\\SOBRE.TXT');
            if (backBtn) backBtn.style.display = 'inline-block';
        } else if (name === 'trash') {
            if (titleText) titleText.textContent = 'Lixeira';
            setPath('C:\\RECYCLED');
            if (backBtn) backBtn.style.display = 'inline-block';
        } else if (name === 'specs') {
            if (titleText) titleText.textContent = 'Hardware & Sistema';
            setPath('C:\\DESKTOP\\HARDWARE.EXE');
            if (backBtn) backBtn.style.display = 'inline-block';
            renderHardwareSpecs();
        }

        const legacyTitle = document.getElementById('taskbar-win-title');
        if (legacyTitle && titleText) legacyTitle.textContent = titleText.textContent;
    }
};

// 2. BLOCO DE NOTAS (NOTEPAD.EXE) 100% FUNCIONAL
const NotepadApp = {
    initialized: false,

    init() {
        if (this.initialized) return;
        this.initialized = true;

        const textarea = document.getElementById('notepad-textarea');
        const picker = document.getElementById('notepad-file-picker');

        if (textarea) {
            textarea.addEventListener('input', () => this.updateStatus());
            textarea.addEventListener('keyup', () => this.updateStatus());
            textarea.addEventListener('click', () => this.updateStatus());
        }

        // Ações do menu Arquivo
        const actNew = document.getElementById('np-action-new');
        if (actNew) {
            actNew.onclick = () => {
                if (textarea) {
                    textarea.value = '';
                    textarea.selectionStart = textarea.selectionEnd = 0;
                }
                const title = document.getElementById('notepad-title-text');
                if (title) title.textContent = 'Sem Título - Bloco de Notas';
                this.updateStatus();
                this.hideMenus();
            };
        }

        const actOpen = document.getElementById('np-action-open');
        if (actOpen && picker) {
            actOpen.onclick = () => {
                picker.click();
                this.hideMenus();
            };
            picker.onchange = (e) => {
                const file = e.target.files[0];
                // Permite reabrir o mesmo arquivo em sequência (change só dispara com valor diferente)
                e.target.value = '';
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        if (textarea) textarea.value = evt.target.result;
                        const title = document.getElementById('notepad-title-text');
                        if (title) title.textContent = `${file.name} - Bloco de Notas`;
                        this.updateStatus();
                    };
                    reader.readAsText(file);
                }
            };
        }

        const actSave = document.getElementById('np-action-save');
        if (actSave) {
            actSave.onclick = () => {
                const content = textarea ? textarea.value : '';
                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'documento.txt';
                a.click();
                // Evita acúmulo de blob URLs a cada salvamento
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                this.hideMenus();
            };
        }

        const actExit = document.getElementById('np-action-exit');
        if (actExit) {
            actExit.onclick = () => {
                WindowManager.closeWindow('notepad');
                this.hideMenus();
            };
        }

        // Ações do menu Editar
        const actSelectAll = document.getElementById('np-action-selectall');
        if (actSelectAll && textarea) {
            actSelectAll.onclick = () => {
                textarea.select();
                this.hideMenus();
            };
        }

        const actDateTime = document.getElementById('np-action-datetime');
        if (actDateTime && textarea) {
            actDateTime.onclick = () => {
                const nowStr = new Date().toLocaleString('pt-BR');
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.substring(0, start) + nowStr + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + nowStr.length;
                this.updateStatus();
                this.hideMenus();
            };
        }

        const actClear = document.getElementById('np-action-clear');
        if (actClear && textarea) {
            actClear.onclick = () => {
                textarea.value = '';
                textarea.selectionStart = textarea.selectionEnd = 0;
                this.updateStatus();
                this.hideMenus();
            };
        }

        const actAbout = document.getElementById('np-action-about');
        if (actAbout) {
            actAbout.onclick = () => {
                RetroDialog.show({
                    title: 'Sobre o Bloco de Notas',
                    message: 'Bloco de Notas do Windows 95\nVersão 4.0 (Build 950)\nDesenvolvido por ' + USER_PROFILE.name + ' com JavaScript e Web Audio API.',
                    type: 'info'
                });
                this.hideMenus();
            };
        }
    },

    loadDocument(docName) {
        this.init();
        const textarea = document.getElementById('notepad-textarea');
        const titleEl = document.getElementById('notepad-title-text');
        if (!textarea) return;

        if (docName === 'sobre') {
            if (titleEl) titleEl.textContent = 'Sobre.txt - Bloco de Notas';
            textarea.value = `=====================================================
Workstation Retro OS v2.0 [Windows 95 Experience]
=====================================================

Bem-vindo ao sistema de simulação retro dos anos 90!

Este projeto combina a renderização 3D de alta precisão
(Three.js, iluminação de estúdio e CRT com fósforo emissivo)
com um desktop retro multitarefas completo do Windows 95.

Recursos do Sistema:
- Janelas simultâneas e gerenciador de processos
- MS Paint interativo com paleta clássica de cores
- Jogo da Cobrinha clássico com placar LED e recorde
- Calculadora com visor e memória
- Propriedades de vídeo com troca de papéis de parede e telas
- Protetores de tela clássicos (Starfield 3D, Matrix, etc.)

Desenvolvido com carinho para entusiastas da computação clássica!
`;
        } else {
            // Preserva conteúdo digitado entre sessões; só rotula "Sem Título" quando vazio
            // para não dessincronizar título x conteúdo de um arquivo nomeado.
            if (!textarea.value && titleEl) titleEl.textContent = 'Sem Título - Bloco de Notas';
            if (!textarea.value) textarea.value = '';
        }
        this.updateStatus();
        setTimeout(() => textarea.focus(), 50);
    },

    updateStatus() {
        const textarea = document.getElementById('notepad-textarea');
        const statusEl = document.getElementById('notepad-status');
        if (!textarea || !statusEl) return;

        const val = textarea.value.substr(0, textarea.selectionStart);
        const lines = val.split('\n');
        const line = lines.length;
        const col = lines[lines.length - 1].length + 1;
        statusEl.textContent = `Lin ${line}, Col ${col}`;
    },

    hideMenus() {
        document.querySelectorAll('#win-notepad .menu-dropdown').forEach(d => {
            d.classList.add('is-hidden');
            d.classList.remove('is-active');
        });
    }
};

// 3. MS PAINT (PBRUSH.EXE)
const PaintApp = {
    canvas: null,
    ctx: null,
    isDrawing: false,
    currentTool: 'pencil',
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    strokeSize: 5,
    startX: 0,
    startY: 0,
    snapshot: null,

    colors: [
        '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080',
        '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000',
        '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff',
        '#ffff80', '#00ff80', '#80ffff', '#7f7fff', '#ff0080', '#ff8040'
    ],

    init() {
        this.canvas = document.getElementById('paint-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        // Reseta estado de traço pendente ao (re)abrir — evita desenho fantasma
        // caso a janela tenha sido fechada no meio de um stroke.
        this.isDrawing = false;
        this.snapshot = null;

        if (!this.initialized) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.renderPalette();
            this.setupEvents();
            this.initialized = true;
        }
    },

    renderPalette() {
        const grid = document.getElementById('paint-palette-grid');
        if (!grid) return;
        grid.innerHTML = '';

        this.colors.forEach(col => {
            const box = document.createElement('div');
            box.className = 'palette-color';
            box.style.backgroundColor = col;
            box.addEventListener('click', () => {
                this.primaryColor = col;
                const p = document.getElementById('paint-color-primary');
                if (p) p.style.backgroundColor = col;
            });
            box.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.secondaryColor = col;
                const s = document.getElementById('paint-color-secondary');
                if (s) s.style.backgroundColor = col;
            });
            grid.appendChild(box);
        });
    },

    setupEvents() {
        document.querySelectorAll('.paint-tool').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.paint-tool').forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                this.currentTool = btn.dataset.tool;
            });
        });

        const sizeSelect = document.getElementById('paint-size-select');
        if (sizeSelect) {
            sizeSelect.addEventListener('change', (e) => {
                this.strokeSize = parseInt(e.target.value, 10);
            });
        }

        this.canvas.addEventListener('pointerdown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.startX = e.clientX - rect.left;
            this.startY = e.clientY - rect.top;

            const isRightClick = e.button === 2;
            const useColor = isRightClick ? this.secondaryColor : this.primaryColor;

            if (this.currentTool === 'bucket') {
                this.floodFill(Math.floor(this.startX), Math.floor(this.startY), useColor);
                // Balde não inicia traço: evita que um drag posterior restaure
                // um snapshot obsoleto por cima do preenchimento.
                this.isDrawing = false;
                this.snapshot = null;
                return;
            }

            this.isDrawing = true;
            this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

            this.ctx.beginPath();
            this.ctx.moveTo(this.startX, this.startY);
            this.ctx.strokeStyle = this.currentTool === 'eraser' ? '#ffffff' : useColor;
            this.ctx.fillStyle = useColor;
            this.ctx.lineWidth = this.currentTool === 'eraser' ? this.strokeSize * 2 : this.strokeSize;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';

            if (this.currentTool === 'pencil' || this.currentTool === 'brush' || this.currentTool === 'eraser') {
                this.ctx.lineTo(this.startX, this.startY);
                this.ctx.stroke();
            }
        });

        window.addEventListener('pointermove', (e) => {
            if (!this.isDrawing || this.currentTool === 'bucket') return;
            const rect = this.canvas.getBoundingClientRect();
            const curX = e.clientX - rect.left;
            const curY = e.clientY - rect.top;

            if (this.currentTool === 'pencil' || this.currentTool === 'brush' || this.currentTool === 'eraser') {
                this.ctx.lineTo(curX, curY);
                this.ctx.stroke();
            } else if (this.snapshot) {
                this.ctx.putImageData(this.snapshot, 0, 0);
                this.ctx.beginPath();
                if (this.currentTool === 'line') {
                    this.ctx.moveTo(this.startX, this.startY);
                    this.ctx.lineTo(curX, curY);
                    this.ctx.stroke();
                } else if (this.currentTool === 'rect') {
                    this.ctx.strokeRect(this.startX, this.startY, curX - this.startX, curY - this.startY);
                } else if (this.currentTool === 'circle') {
                    const radius = Math.hypot(curX - this.startX, curY - this.startY);
                    this.ctx.arc(this.startX, this.startY, radius, 0, Math.PI * 2);
                    this.ctx.stroke();
                }
            }
        });

        window.addEventListener('pointerup', () => {
            this.isDrawing = false;
        });
        // Toque/pointercancel (ex.: gesto do SO) também encerra o traço.
        window.addEventListener('pointercancel', () => {
            this.isDrawing = false;
        });

        // Botão direito desenha com a cor secundária: suprime o menu do navegador
        // sobre o canvas para não interromper o traço.
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        const newBtn = document.getElementById('paint-action-new');
        if (newBtn) {
            newBtn.addEventListener('click', () => {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                this.snapshot = null;
            });
        }

        const clearBtn = document.getElementById('paint-action-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                this.snapshot = null;
            });
        }

        const saveBtn = document.getElementById('paint-action-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const a = document.createElement('a');
                a.href = this.canvas.toDataURL('image/png');
                a.download = 'desenho.png';
                a.click();
            });
        }
    },

    floodFill(startX, startY, fillColor) {
        const imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imgData.data;
        const w = this.canvas.width;
        const h = this.canvas.height;

        const parseHex = (hex) => {
            const c = parseInt(hex.replace('#', ''), 16);
            return [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];
        };

        const target = parseHex(fillColor);
        const startIndex = (startY * w + startX) * 4;
        const startR = data[startIndex];
        const startG = data[startIndex + 1];
        const startB = data[startIndex + 2];

        if (startR === target[0] && startG === target[1] && startB === target[2]) return;

        const matchStart = (idx) => {
            return data[idx] === startR && data[idx + 1] === startG && data[idx + 2] === startB;
        };

        const stack = [[startX, startY]];
        while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            const idx = (cy * w + cx) * 4;

            if (cx < 0 || cx >= w || cy < 0 || cy >= h || !matchStart(idx)) continue;

            data[idx] = target[0];
            data[idx + 1] = target[1];
            data[idx + 2] = target[2];
            data[idx + 3] = 255;

            stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }

        this.ctx.putImageData(imgData, 0, 0);
    }
};

// 4. JOGO DA COBRINHA RETRÔ (SNAKE.EXE) 100% FUNCIONAL
const SnakeApp = {
    canvas: null,
    ctx: null,
    gridSize: 18,
    tileCount: 20, // 20x20 tiles = 360x360px
    snake: [],
    dx: 1,
    dy: 0,
    nextDx: 1,
    nextDy: 0,
    food: { x: 15, y: 10 },
    score: 0,
    highScore: 0,
    speedMs: 90,
    intervalId: null,
    isPaused: false,
    isGameOver: false,
    proc: null,

    init(proc = null) {
        this.proc = proc;
        this.canvas = document.getElementById('snake-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.highScore = parseInt(localStorage.getItem('snake_highscore') || '0', 10);
        if (isNaN(this.highScore) || this.highScore < 0) this.highScore = 0;
        const hiEl = document.getElementById('snake-highscore');
        if (hiEl) hiEl.textContent = String(this.highScore).padStart(3, '0');

        if (this.proc) {
            this.proc.onDestroy = () => {
                this.stop();
                this.proc = null;
            };
        }

        this.setupEvents();
        this.startNewGame();
    },

    setupEvents() {
        const addEv = (target, type, listener, options) => {
            if (this.proc) {
                this.proc.addEventListener(target, type, listener, options);
            } else {
                target.addEventListener(type, listener, options);
            }
        };

        // Teclado com descarte garantido pelo ciclo de vida do processo
        addEv(window, 'keydown', (e) => {
            const win = document.getElementById('win-snake');
            if (!win || win.classList.contains('is-hidden')) return;
            // Não rouba setas/Espaço de outras janelas (ex.: cursor no Bloco de Notas
            // enquanto a Cobrinha está aberta ao fundo).
            if (typeof WindowManager !== 'undefined' && WindowManager.activeAppId !== 'snake') return;

            // Guarda anti-reversão sobre a direção PENDENTE (nextDx/nextDy), não a
            // confirmada: impede suicídio 180° em duplo giro dentro do mesmo tick
            // e ignora direcionais com o jogo encerrado (Espaço/F2 reiniciam).
            if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
                if (!this.isGameOver && this.nextDy === 0) { this.nextDx = 0; this.nextDy = -1; }
                e.preventDefault();
            } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
                if (!this.isGameOver && this.nextDy === 0) { this.nextDx = 0; this.nextDy = 1; }
                e.preventDefault();
            } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                if (!this.isGameOver && this.nextDx === 0) { this.nextDx = -1; this.nextDy = 0; }
                e.preventDefault();
            } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                if (!this.isGameOver && this.nextDx === 0) { this.nextDx = 1; this.nextDy = 0; }
                e.preventDefault();
            } else if (e.key === ' ' || e.key === 'Spacebar') {
                if (this.isGameOver) {
                    this.startNewGame();
                } else {
                    this.togglePause();
                }
                e.preventDefault();
            } else if (e.key === 'F2') {
                this.startNewGame();
                e.preventDefault();
            }
        });

        // Botões de interface
        const resetBtn = document.getElementById('btn-snake-reset');
        if (resetBtn) addEv(resetBtn, 'click', () => this.startNewGame());

        const playAgainBtn = document.getElementById('btn-snake-playagain');
        if (playAgainBtn) addEv(playAgainBtn, 'click', () => this.startNewGame());

        const actNew = document.getElementById('snake-action-new');
        if (actNew) addEv(actNew, 'click', () => this.startNewGame());

        const actPause = document.getElementById('snake-action-pause');
        if (actPause) addEv(actPause, 'click', () => this.togglePause());

        const actExit = document.getElementById('snake-action-exit');
        if (actExit) addEv(actExit, 'click', () => WindowManager.closeWindow('snake'));

        // Velocidades
        const setSpeed = (spd, elId) => {
            this.speedMs = spd;
            document.querySelectorAll('#snake-menu-options .dropdown-item').forEach(d => d.classList.remove('is-checked'));
            const checkedEl = document.getElementById(elId);
            if (checkedEl) checkedEl.classList.add('is-checked');
            if (!this.isGameOver && !this.isPaused) {
                this.clearLoop();
                this.startLoop();
            }
        };

        const spdEasy = document.getElementById('snake-speed-easy');
        if (spdEasy) addEv(spdEasy, 'click', () => setSpeed(140, 'snake-speed-easy'));

        const spdMed = document.getElementById('snake-speed-med');
        if (spdMed) addEv(spdMed, 'click', () => setSpeed(90, 'snake-speed-med'));

        const spdFast = document.getElementById('snake-speed-fast');
        if (spdFast) addEv(spdFast, 'click', () => setSpeed(60, 'snake-speed-fast'));

        const spdInsane = document.getElementById('snake-speed-insane');
        if (spdInsane) addEv(spdInsane, 'click', () => setSpeed(40, 'snake-speed-insane'));

        const actAbout = document.getElementById('snake-action-about');
        if (actAbout) {
            addEv(actAbout, 'click', () => {
                RetroDialog.show({
                    title: 'Sobre a Cobrinha Arcade',
                    message: 'Cobrinha Arcade 1995\nUse as teclas de seta ou WASD para controlar.\nEspaço pausa o jogo.',
                    type: 'info'
                });
            });
        }
    },

    startLoop() {
        this.clearLoop();
        if (this.proc) {
            this.intervalId = this.proc.setInterval(() => this.tick(), this.speedMs);
        } else {
            this.intervalId = setInterval(() => this.tick(), this.speedMs);
        }
    },

    clearLoop() {
        if (this.intervalId !== null) {
            if (this.proc) {
                this.proc.clearInterval(this.intervalId);
            } else {
                clearInterval(this.intervalId);
            }
            this.intervalId = null;
        }
    },

    startNewGame() {
        this.clearLoop();
        this.isGameOver = false;
        this.isPaused = false;
        this.score = 0;
        this.dx = 1;
        this.dy = 0;
        this.nextDx = 1;
        this.nextDy = 0;

        this.snake = [
            { x: 8, y: 10 },
            { x: 7, y: 10 },
            { x: 6, y: 10 }
        ];

        this.spawnFood();

        const scoreEl = document.getElementById('snake-score');
        if (scoreEl) scoreEl.textContent = '000';

        const resetBtn = document.getElementById('btn-snake-reset');
        if (resetBtn) resetBtn.textContent = '🎮';

        const overlay = document.getElementById('snake-gameover-overlay');
        if (overlay) overlay.classList.add('is-hidden');

        this.draw();
        this.startLoop();
    },

    stop() {
        this.clearLoop();
    },

    togglePause() {
        if (this.isGameOver) return;
        this.isPaused = !this.isPaused;
        const resetBtn = document.getElementById('btn-snake-reset');
        if (this.isPaused) {
            this.clearLoop();
            if (resetBtn) resetBtn.textContent = '⏸️';
        } else {
            this.startLoop();
            if (resetBtn) resetBtn.textContent = '🎮';
        }
    },

    spawnFood() {
        // Busca limitada: com o tabuleiro cheio o while(true) original travava o loop.
        let valid = false;
        let attempts = 0;
        while (!valid && attempts < 2000) {
            attempts++;
            this.food = {
                x: Math.floor(Math.random() * this.tileCount),
                y: Math.floor(Math.random() * this.tileCount)
            };
            valid = !this.snake.some(segment => segment.x === this.food.x && segment.y === this.food.y);
        }
        if (!valid) {
            // Tabuleiro sem célula livre: vitória por tabuleiro cheio.
            this.gameOver();
        }
    },

    tick() {
        if (this.isGameOver || this.isPaused) return;

        this.dx = this.nextDx;
        this.dy = this.nextDy;

        const head = { x: this.snake[0].x + this.dx, y: this.snake[0].y + this.dy };

        // Colisão com paredes
        if (head.x < 0 || head.x >= this.tileCount || head.y < 0 || head.y >= this.tileCount) {
            this.gameOver();
            return;
        }

        // Colisão consigo mesma
        if (this.snake.some(seg => seg.x === head.x && seg.y === head.y)) {
            this.gameOver();
            return;
        }

        this.snake.unshift(head);

        // Comeu comida
        if (head.x === this.food.x && head.y === this.food.y) {
            getRetroAudio().playClick('sharp');
            this.score += 10;
            const scoreEl = document.getElementById('snake-score');
            if (scoreEl) scoreEl.textContent = String(this.score).padStart(3, '0');

            if (this.score > this.highScore) {
                this.highScore = this.score;
                localStorage.setItem('snake_highscore', this.highScore);
                const hiEl = document.getElementById('snake-highscore');
                if (hiEl) hiEl.textContent = String(this.highScore).padStart(3, '0');
            }

            this.spawnFood();
        } else {
            this.snake.pop();
        }

        this.draw();
    },

    draw() {
        if (!this.ctx) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const sz = this.gridSize;

        // Fundo LCD verde retrô
        this.ctx.fillStyle = '#9bbc0f';
        this.ctx.fillRect(0, 0, w, h);

        // Grade sutil
        this.ctx.strokeStyle = '#8bac0f';
        this.ctx.lineWidth = 0.5;
        for (let x = 0; x < w; x += sz) {
            this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, h); this.ctx.stroke();
        }
        for (let y = 0; y < h; y += sz) {
            this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(w, y); this.ctx.stroke();
        }

        // Comida (Maçã vermelha pixelada com brilho)
        const fx = this.food.x * sz;
        const fy = this.food.y * sz;
        this.ctx.fillStyle = '#d00000';
        this.ctx.fillRect(fx + 2, fy + 2, sz - 4, sz - 4);
        this.ctx.fillStyle = '#008000';
        this.ctx.fillRect(fx + sz / 2 - 1, fy, 2, 3); // folhinha
        this.ctx.fillStyle = '#ff8080';
        this.ctx.fillRect(fx + 3, fy + 3, 3, 3); // brilho

        // Cobra com estilo 3D Bevel
        this.snake.forEach((seg, index) => {
            const sx = seg.x * sz;
            const sy = seg.y * sz;

            if (index === 0) {
                // Cabeça
                this.ctx.fillStyle = '#0f380f';
                this.ctx.fillRect(sx + 1, sy + 1, sz - 2, sz - 2);

                // Olhos
                this.ctx.fillStyle = '#ffffff';
                if (this.dx === 1) {
                    this.ctx.fillRect(sx + 11, sy + 3, 3, 3);
                    this.ctx.fillRect(sx + 11, sy + 11, 3, 3);
                } else if (this.dx === -1) {
                    this.ctx.fillRect(sx + 3, sy + 3, 3, 3);
                    this.ctx.fillRect(sx + 3, sy + 11, 3, 3);
                } else if (this.dy === -1) {
                    this.ctx.fillRect(sx + 3, sy + 3, 3, 3);
                    this.ctx.fillRect(sx + 11, sy + 3, 3, 3);
                } else {
                    this.ctx.fillRect(sx + 3, sy + 11, 3, 3);
                    this.ctx.fillRect(sx + 11, sy + 11, 3, 3);
                }
            } else {
                // Corpo
                this.ctx.fillStyle = '#306230';
                this.ctx.fillRect(sx + 1, sy + 1, sz - 2, sz - 2);

                this.ctx.fillStyle = '#8bac0f';
                this.ctx.fillRect(sx + 3, sy + 3, sz - 6, sz - 6);
            }
        });
    },

    gameOver() {
        this.clearLoop();
        this.isGameOver = true;
        getRetroAudio().playErrorSound();

        const resetBtn = document.getElementById('btn-snake-reset');
        if (resetBtn) resetBtn.textContent = '😵';

        const finalScore = document.getElementById('snake-final-score');
        if (finalScore) finalScore.textContent = this.score;

        const overlay = document.getElementById('snake-gameover-overlay');
        if (overlay) overlay.classList.remove('is-hidden');
    }
};

// 5. CALCULADORA (CALC.EXE)
const CalcApp = {
    displayValue: '0.',
    firstOperand: null,
    waitingForSecond: false,
    operator: null,
    memoryValue: 0,
    hasDecimal: false,
    kbdBound: false,

    // Normaliza resultado: preserva inteiros (inclusive grandes) e arredonda
    // frações binárias (ex.: 0.1+0.2) para 12 dígitos significativos.
    normNum(n) {
        if (typeof n !== 'number' || !isFinite(n)) return 0;
        return Number.isInteger(n) ? n : parseFloat(n.toPrecision(12));
    },

    // Exibe número no visor mantendo a convenção retrô de '.' final em inteiros.
    setDisplayNum(n) {
        const v = this.normNum(n);
        this.displayValue = Number.isInteger(v) ? String(v) + '.' : String(v);
        this.hasDecimal = !Number.isInteger(v);
    },

    init() {
        document.querySelectorAll('.btn-calc').forEach(btn => {
            btn.onclick = () => {
                getRetroAudio().playClick('subtle');
                const action = btn.dataset.calc;
                this.handleInput(action);
            };
        });

        // Teclado físico (bind-once): só atua com a calculadora focada e fora
        // de campos de texto de outros apps (ex.: Bloco de Notas).
        if (!this.kbdBound) {
            this.kbdBound = true;
            window.addEventListener('keydown', (e) => {
                const win = document.getElementById('win-calc');
                if (!win || win.classList.contains('is-hidden')) return;
                if (typeof WindowManager !== 'undefined' && WindowManager.activeAppId !== 'calc') return;
                if (e.target && e.target.matches && e.target.matches('textarea, input:not(#calc-display)')) return;

                let action = null;
                if (/^[0-9]$/.test(e.key)) action = e.key;
                else if (e.key === '.' || e.key === ',') action = '.';
                else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/' || e.key === '%') action = e.key;
                else if (e.key === 'Enter' || e.key === '=') action = '=';
                else if (e.key === 'Escape') action = 'C';
                else if (e.key === 'Backspace') action = 'back';
                if (action !== null) {
                    e.preventDefault();
                    getRetroAudio().playClick('subtle');
                    this.handleInput(action);
                }
            });
        }
    },

    handleInput(val) {
        const display = document.getElementById('calc-display');
        if (!display) return;

        // Comparação lexicográfica pura ('1/x' >= '0') desviava funções para o
        // ramo de dígitos: exige caractere único.
        if (typeof val === 'string' && val.length === 1 && val >= '0' && val <= '9') {
            if (this.waitingForSecond) {
                this.displayValue = val;
                this.waitingForSecond = false;
                this.hasDecimal = false;
            } else if (!this.hasDecimal && (this.displayValue === '0.' || this.displayValue === '0')) {
                this.displayValue = val;
                this.hasDecimal = false;
            } else if (this.hasDecimal) {
                this.displayValue += val;
            } else {
                this.displayValue = this.displayValue.replace('.', '') + val;
            }
        } else if (val === '.') {
            if (this.waitingForSecond) {
                this.displayValue = '0.';
                this.waitingForSecond = false;
                this.hasDecimal = true;
            } else if (!this.hasDecimal) {
                if (!this.displayValue.includes('.')) this.displayValue += '.';
                this.hasDecimal = true;
            }
        } else if (val === 'C') {
            this.displayValue = '0.';
            this.hasDecimal = false;
            this.firstOperand = null;
            this.waitingForSecond = false;
            this.operator = null;
        } else if (val === 'CE') {
            this.displayValue = '0.';
            this.hasDecimal = false;
        } else if (val === 'back') {
            let str = this.displayValue;
            str = str.slice(0, -1);
            if (str.length === 0 || str === '-') {
                this.displayValue = '0.';
                this.hasDecimal = false;
            } else {
                // Remove ponto pendente (ex.: '10.' -> '10') para não confundir
                // marcador inteiro com fração em digitação posterior.
                if (str.endsWith('.')) str = str.slice(0, -1);
                if (str.length === 0 || str === '-') {
                    this.displayValue = '0.';
                    this.hasDecimal = false;
                } else {
                    this.displayValue = str;
                    this.hasDecimal = /\.\d/.test(str);
                }
            }
        } else if (['+', '-', '*', '/'].includes(val)) {
            const inputNum = parseFloat(this.displayValue);
            if (this.firstOperand === null) {
                this.firstOperand = inputNum;
            } else if (this.operator) {
                const result = this.normNum(this.calculate(this.firstOperand, inputNum, this.operator));
                this.setDisplayNum(result);
                this.firstOperand = result;
            }
            this.waitingForSecond = true;
            this.operator = val;
        } else if (val === '=') {
            const inputNum = parseFloat(this.displayValue);
            if (this.firstOperand !== null && this.operator) {
                const result = this.normNum(this.calculate(this.firstOperand, inputNum, this.operator));
                this.setDisplayNum(result);
                this.firstOperand = null;
                this.operator = null;
                // Próximo dígito inicia nova entrada (não concatena no resultado).
                this.waitingForSecond = true;
            }
        } else if (val === '%') {
            const inputNum = parseFloat(this.displayValue);
            if (this.firstOperand !== null && this.operator) {
                // Percentual contextual Win95: 200+10% => 20 (parcela), 50*10% => 5.
                const pct = (this.operator === '+' || this.operator === '-')
                    ? this.firstOperand * inputNum / 100
                    : inputNum / 100;
                this.setDisplayNum(pct);
            } else {
                this.setDisplayNum(inputNum / 100);
            }
        } else if (val === 'sqrt') {
            const num = parseFloat(this.displayValue);
            this.setDisplayNum(Math.sqrt(num));
        } else if (val === '1/x') {
            const num = parseFloat(this.displayValue);
            this.setDisplayNum(1 / num);
        } else if (val === '+/-') {
            const num = parseFloat(this.displayValue);
            this.setDisplayNum(-num);
        } else if (val === 'MC') {
            this.memoryValue = 0;
        } else if (val === 'MR') {
            this.setDisplayNum(this.memoryValue);
            this.waitingForSecond = false;
        } else if (val === 'MS') {
            this.memoryValue = this.normNum(parseFloat(this.displayValue));
        } else if (val === 'M+') {
            this.memoryValue = this.normNum(this.memoryValue + parseFloat(this.displayValue));
        }

        display.value = this.displayValue;
    },

    calculate(a, b, op) {
        if (op === '+') return a + b;
        if (op === '-') return a - b;
        if (op === '*') return a * b;
        if (op === '/') return b !== 0 ? a / b : 0;
        return b;
    }
};

// 6. PROPRIEDADES DE VÍDEO (DISPLAY PROPERTIES) 100% FUNCIONAL
// Mapeamento preset de papel de parede -> classe CSS (style.css só define
// bg-teal/clouds/setup/matrix/winxp/cyber; sem ele, presets geravam classes
// inexistentes como bg-classic-teal).
function resolveWallpaperClass(preset) {
    const map = {
        'classic-teal': 'teal',
        'clouds': 'clouds',
        'setup': 'setup',
        'winxp': 'winxp',
        'matrix': 'matrix',
        'cyber': 'cyber'
    };
    return map[preset] || 'teal';
}

const DISPLAY_THEMES = ['win95-default', 'win98-teal', 'high-contrast', 'desert', 'matrix-hacker', 'vaporwave'];
const DISPLAY_WP_PRESETS = ['classic-teal', 'clouds', 'setup', 'winxp', 'matrix', 'cyber'];
const DISPLAY_CRT_MODES = ['subtle', 'tube', 'off'];

function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        // Quota excedida (ex.: wallpaper customizado grande): aplica visualmente
        // sem persistir, em vez de abortar o restante do Aplicar.
        console.warn(`[DisplayApp] LocalStorage indisponível para "${key}":`, e);
        return false;
    }
}

const DisplayApp = {
    pendingWallpaper: null,
    pendingTheme: null,
    pendingRes: null,
    pendingCrtMode: null,
    animId: null,

    init() {
        // Estado pendente sempre limpo ao abrir (Cancelar da sessão anterior
        // não pode vazar para o próximo Aplicar).
        this.pendingWallpaper = null;
        this.pendingTheme = null;
        this.pendingRes = null;
        this.pendingCrtMode = null;

        // Abas de navegação
        document.querySelectorAll('.tabs-nav .tab-btn').forEach(btn => {
            btn.onclick = () => {
                getRetroAudio().playClick('subtle');
                document.querySelectorAll('.tabs-nav .tab-btn').forEach(b => b.classList.remove('is-active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('is-active'));
                btn.classList.add('is-active');
                const target = document.getElementById(btn.dataset.tab);
                if (target) target.classList.add('is-active');
            };
        });

        // 1. Papel de Parede
        const wpSelect = document.getElementById('wallpaper-select');
        const previewBg = document.getElementById('preview-screen-bg');
        const btnBrowse = document.getElementById('btn-browse-wallpaper');
        const filePicker = document.getElementById('file-custom-wallpaper');

        const updateWpPreview = (val, customUrl, markPending = true) => {
            if (!previewBg) return;
            if (customUrl) {
                previewBg.style.background = `url(${customUrl}) center/cover no-repeat`;
                if (markPending) this.pendingWallpaper = { type: 'custom', url: customUrl };
            } else if (val === 'classic-teal') {
                previewBg.style.background = '#008080';
                if (markPending) this.pendingWallpaper = { type: 'preset', val: 'classic-teal' };
            } else if (val === 'clouds') {
                previewBg.style.background = 'linear-gradient(180deg, #1060a0, #d0e8f8)';
                if (markPending) this.pendingWallpaper = { type: 'preset', val: 'clouds' };
            } else if (val === 'setup') {
                previewBg.style.background = '#000080';
                if (markPending) this.pendingWallpaper = { type: 'preset', val: 'setup' };
            } else if (val === 'winxp') {
                previewBg.style.background = 'linear-gradient(180deg, #3080e0, #80c060)';
                if (markPending) this.pendingWallpaper = { type: 'preset', val: 'winxp' };
            } else if (val === 'matrix') {
                previewBg.style.background = '#030a04';
                if (markPending) this.pendingWallpaper = { type: 'preset', val: 'matrix' };
            } else if (val === 'cyber') {
                previewBg.style.background = 'linear-gradient(135deg, #2b0054, #730068, #ff007f)';
                if (markPending) this.pendingWallpaper = { type: 'preset', val: 'cyber' };
            }
        };

        if (wpSelect) {
            wpSelect.onchange = () => updateWpPreview(wpSelect.value, null);
        }

        if (btnBrowse && filePicker) {
            btnBrowse.onclick = () => filePicker.click();
            filePicker.onchange = (e) => {
                const file = e.target.files[0];
                // Permite escolher o mesmo arquivo em sequência.
                e.target.value = '';
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        updateWpPreview(null, evt.target.result);
                    };
                    reader.readAsDataURL(file);
                }
            };
        }

        // 2. Proteção de Tela Preview
        this.startScreensaverPreview();

        const btnPreview = document.getElementById('btn-preview-screensaver');
        if (btnPreview) {
            btnPreview.onclick = () => {
                const scrSelect = document.getElementById('screensaver-select');
                const type = scrSelect ? scrSelect.value : 'starfield';
                if (type === 'none') return; // "(Nenhum)": nada a visualizar
                ScreensaverEngine.start(type);
            };
        }

        // 3. Aparência / Temas
        const themeSelect = document.getElementById('theme-select');
        const themeWin = document.getElementById('theme-sample-win');

        if (themeSelect) {
            themeSelect.onchange = () => {
                const t = themeSelect.value;
                this.pendingTheme = t;
                if (themeWin) {
                    themeWin.className = `theme-sample-win theme-${t}`;
                }
            };
        }

        // 4. Resolução (persistida; restaurada abaixo na sincronização)
        const resSlider = document.getElementById('res-slider');
        const resText = document.getElementById('res-display-text');
        const resLabel = (v) => {
            if (!resText) return;
            if (v === 1) resText.textContent = '640 x 480 pixels';
            else if (v === 2) resText.textContent = '800 x 600 pixels';
            else if (v === 3) resText.textContent = '1024 x 768 pixels';
        };
        if (resSlider) {
            resSlider.oninput = (e) => {
                const v = parseInt(e.target.value, 10);
                this.pendingRes = v;
                resLabel(v);
            };
        }

        // 5. Efeito Monitor CRT
        const crtSelect = document.getElementById('crt-mode-select');
        if (crtSelect) {
            crtSelect.onchange = () => {
                this.pendingCrtMode = crtSelect.value;
            };
        }

        // Botões OK, Aplicar, Cancelar
        const btnApply = document.getElementById('btn-save-display');
        const btnOk = document.getElementById('btn-apply-display');
        const btnCancel = document.getElementById('btn-cancel-display');

        const applyChanges = () => {
            getRetroAudio().playClick('subtle');
            const desktop = document.getElementById('retro-desktop');
            const retroOs = document.getElementById('retro-os');

            if (this.pendingWallpaper && desktop) {
                if (this.pendingWallpaper.type === 'custom') {
                    desktop.className = 'retro-desktop';
                    desktop.style.backgroundImage = `url(${this.pendingWallpaper.url})`;
                    desktop.style.backgroundSize = 'cover';
                    desktop.style.backgroundPosition = 'center';
                    storageSet('win_wallpaper_custom', this.pendingWallpaper.url);
                    try { localStorage.removeItem('win_wallpaper_preset'); } catch (e) {}
                } else {
                    desktop.style.backgroundImage = '';
                    desktop.className = `retro-desktop bg-${resolveWallpaperClass(this.pendingWallpaper.val)}`;
                    storageSet('win_wallpaper_preset', this.pendingWallpaper.val);
                    try { localStorage.removeItem('win_wallpaper_custom'); } catch (e) {}
                }
            }

            if (this.pendingTheme && retroOs) {
                retroOs.classList.remove('theme-win95-default', 'theme-win98-teal', 'theme-high-contrast', 'theme-desert', 'theme-matrix-hacker', 'theme-vaporwave');
                if (this.pendingTheme !== 'win95-default') {
                    retroOs.classList.add(`theme-${this.pendingTheme}`);
                    storageSet('win_theme', this.pendingTheme);
                } else {
                    try { localStorage.removeItem('win_theme'); } catch (e) {}
                }
            }

            if (this.pendingCrtMode) {
                const crtOverlay = document.getElementById('crt-overlay');
                if (crtOverlay) {
                    crtOverlay.className = `crt-screen-overlay crt-mode-${this.pendingCrtMode}`;
                }
                storageSet('win_crt_mode', this.pendingCrtMode);
            }

            if (this.pendingRes !== null && this.pendingRes !== undefined) {
                storageSet('win_res', String(this.pendingRes));
            }
        };

        if (btnApply) btnApply.onclick = applyChanges;
        if (btnOk) {
            btnOk.onclick = () => {
                applyChanges();
                WindowManager.closeWindow('display');
            };
        }
        if (btnCancel) {
            btnCancel.onclick = () => {
                // Descarta seleções não aplicadas da sessão.
                this.pendingWallpaper = null;
                this.pendingTheme = null;
                this.pendingRes = null;
                this.pendingCrtMode = null;
                WindowManager.closeWindow('display');
            };
        }

        // Sincroniza controles com o estado aplicado/persistido (não marca pendente).
        try {
            const savedWpCustom = localStorage.getItem('win_wallpaper_custom');
            const savedWpPreset = localStorage.getItem('win_wallpaper_preset') || 'classic-teal';
            if (wpSelect) {
                wpSelect.value = savedWpCustom ? 'classic-teal' : (DISPLAY_WP_PRESETS.includes(savedWpPreset) ? savedWpPreset : 'classic-teal');
            }
            updateWpPreview(savedWpCustom ? null : (DISPLAY_WP_PRESETS.includes(savedWpPreset) ? savedWpPreset : 'classic-teal'), savedWpCustom || null, false);

            const savedTheme = localStorage.getItem('win_theme') || 'win95-default';
            if (themeSelect) {
                themeSelect.value = DISPLAY_THEMES.includes(savedTheme) ? savedTheme : 'win95-default';
                if (themeWin) themeWin.className = `theme-sample-win theme-${themeSelect.value}`;
            }

            const savedRes = parseInt(localStorage.getItem('win_res') || '2', 10);
            if (resSlider) {
                resSlider.value = (savedRes >= 1 && savedRes <= 3) ? savedRes : 2;
                resLabel(parseInt(resSlider.value, 10));
            }

            const savedCrt = localStorage.getItem('win_crt_mode') || 'subtle';
            if (crtSelect) {
                crtSelect.value = DISPLAY_CRT_MODES.includes(savedCrt) ? savedCrt : 'subtle';
            }
        } catch (e) {}
    },

    startScreensaverPreview() {
        // Um único loop por vez: reaberturas reutilizam o ativo em vez de empilhar.
        if (this.animId !== null) return;
        const pCanvas = document.getElementById('screensaver-preview-canvas');
        if (!pCanvas) return;
        const ctx = pCanvas.getContext('2d');
        let stars = Array.from({ length: 45 }, () => ({ x: Math.random() * 160, y: Math.random() * 110, z: Math.random() * 160 }));

        const anim = () => {
            // Auto-encerra ao fechar a janela (init reinicia na próxima abertura).
            const dispWin = document.getElementById('win-display');
            if (!dispWin || dispWin.classList.contains('is-hidden')) {
                this.animId = null;
                return;
            }
            if (pCanvas.offsetParent !== null) {
                const scrSelect = document.getElementById('screensaver-select');
                const type = scrSelect ? scrSelect.value : 'starfield';

                if (type === 'matrix') {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
                    ctx.fillRect(0, 0, 160, 110);
                    ctx.fillStyle = '#00ff41';
                    ctx.font = '10px monospace';
                    for (let x = 8; x < 160; x += 16) {
                        ctx.fillText(String.fromCharCode(65 + Math.floor(Math.random() * 26)), x, Math.random() * 110);
                    }
                } else if (type === 'flying-windows') {
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0, 0, 160, 110);
                    const now = Date.now() * 0.003;
                    const x = 70 + Math.sin(now) * 40;
                    const y = 45 + Math.cos(now) * 25;
                    ctx.fillStyle = '#ff0000'; ctx.fillRect(x, y, 10, 10);
                    ctx.fillStyle = '#00ff00'; ctx.fillRect(x + 11, y, 10, 10);
                    ctx.fillStyle = '#0000ff'; ctx.fillRect(x, y + 11, 10, 10);
                    ctx.fillStyle = '#ffff00'; ctx.fillRect(x + 11, y + 11, 10, 10);
                } else if (type === 'snake-ai') {
                    ctx.fillStyle = '#9bbc0f';
                    ctx.fillRect(0, 0, 160, 110);
                    ctx.fillStyle = '#0f380f';
                    const now = Date.now() * 0.005;
                    for (let i = 0; i < 6; i++) {
                        ctx.fillRect(80 + Math.sin(now - i * 0.2) * 50, 55 + Math.cos(now - i * 0.2) * 30, 8, 8);
                    }
                } else {
                    // Starfield
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0, 0, 160, 110);
                    ctx.fillStyle = '#ffffff';
                    stars.forEach(s => {
                        s.z -= 1.8;
                        if (s.z <= 0) s.z = 160;
                        const k = 80 / s.z;
                        const px = (s.x - 80) * k + 80;
                        const py = (s.y - 55) * k + 55;
                        if (px >= 0 && px < 160 && py >= 0 && py < 110) {
                            ctx.fillRect(px, py, Math.max(1, (160 - s.z) / 40), Math.max(1, (160 - s.z) / 40));
                        }
                    });
                }
            }
            this.animId = requestAnimationFrame(anim);
        };
        anim();
    }
};

// 7. GERENCIADOR DE TAREFAS (TASK MANAGER)
const TaskMgrApp = {
    proc: null,
    selectedApp: null,
    hasGraph: false,

    render(proc = null) {
        this.proc = proc;
        if (this.proc) {
            this.proc.onDestroy = () => {
                this.hasGraph = false;
                this.proc = null;
            };
        }

        const addEv = (target, type, listener, options) => {
            if (this.proc) {
                this.proc.addEventListener(target, type, listener, options);
            } else {
                target.addEventListener(type, listener, options);
            }
        };

        const updateTaskList = () => {
            const list = document.getElementById('taskmgr-tasks-list');
            if (!list) return;
            list.innerHTML = '';

            const kernelProcs = (window.RetroOS && window.RetroOS.Kernel) ? window.RetroOS.Kernel.listProcesses() : [];
            if (kernelProcs.length > 0) {
                kernelProcs.forEach((p) => {
                    const item = document.createElement('div');
                    item.className = 'taskmgr-item' + (this.selectedApp === p.name ? ' is-selected' : '');
                    const iconClass = WindowManager.getAppIconClass(p.name);
                    const title = WindowManager.getAppTitle(p.name, '');
                    item.innerHTML = `<span class="${iconClass}"></span> <span>${title} [PID: ${p.pid}]</span> <span style="margin-left:auto;color:#008000;">Em Execução (${p.uptime}s)</span>`;
                    item.onclick = () => {
                        document.querySelectorAll('.taskmgr-item').forEach(i => i.classList.remove('is-selected'));
                        item.classList.add('is-selected');
                        this.selectedApp = p.name;
                    };
                    list.appendChild(item);
                });
            } else {
                WindowManager.openApps.forEach((data, id) => {
                    const item = document.createElement('div');
                    item.className = 'taskmgr-item' + (this.selectedApp === id ? ' is-selected' : '');
                    const iconClass = WindowManager.getAppIconClass(id);
                    const title = WindowManager.getAppTitle(id, '');
                    item.innerHTML = `<span class="${iconClass}"></span> <span>${title}</span> <span style="margin-left:auto;color:#008000;">Em Execução</span>`;
                    item.onclick = () => {
                        document.querySelectorAll('.taskmgr-item').forEach(i => i.classList.remove('is-selected'));
                        item.classList.add('is-selected');
                        this.selectedApp = id;
                    };
                    list.appendChild(item);
                });
            }
        };

        updateTaskList();

        // Atualização periódica da lista controlada pelo processo
        if (this.proc) {
            this.proc.setInterval(updateTaskList, 1000);
        }

        this.startCpuGraph();

        const btnEnd = document.getElementById('btn-taskmgr-endtask');
        if (btnEnd) {
            addEv(btnEnd, 'click', () => {
                if (this.selectedApp) {
                    WindowManager.closeWindow(this.selectedApp);
                    this.selectedApp = null;
                    updateTaskList();
                }
            });
        }

        const btnSwitch = document.getElementById('btn-taskmgr-switch');
        if (btnSwitch) {
            addEv(btnSwitch, 'click', () => {
                if (this.selectedApp) {
                    WindowManager.focusWindow(this.selectedApp);
                }
            });
        }
    },

    startCpuGraph() {
        const canvas = document.getElementById('taskmgr-cpu-canvas');
        if (!canvas || this.hasGraph) return;
        this.hasGraph = true;
        const ctx = canvas.getContext('2d');
        const history = Array(70).fill(20);

        const updateGraph = () => {
            history.shift();
            const load = Math.min(95, Math.max(5, history[history.length - 1] + (Math.random() * 20 - 10)));
            history.push(load);

            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = '#0a3810';
            ctx.lineWidth = 1;
            for (let x = 0; x < canvas.width; x += 14) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
            }
            for (let y = 0; y < canvas.height; y += 14) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
            }

            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            history.forEach((val, i) => {
                const x = (i / history.length) * canvas.width;
                const y = canvas.height - (val / 100) * canvas.height;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        };

        if (this.proc) {
            this.proc.setInterval(updateGraph, 300);
        } else {
            setInterval(updateGraph, 300);
        }
    }
};

// 8. DATA E HORA COM RELÓGIO ANALÓGICO
const DateTimeApp = {
    currentDate: new Date(),
    initialized: false,
    hasClock: false,
    activeProc: null,

    init(proc) {
        this.activeProc = proc || null;
        this.renderCalendar();
        this.startAnalogClock(proc);

        // Guard: registra os botões de navegação apenas uma vez por processo
        if (!this.initialized) {
            this.initialized = true;

            const btnPrev = document.getElementById('cal-prev-month');
            const btnNext = document.getElementById('cal-next-month');
            if (btnPrev) {
                btnPrev.onclick = () => {
                    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
                    this.renderCalendar();
                };
            }
            if (btnNext) {
                btnNext.onclick = () => {
                    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
                    this.renderCalendar();
                };
            }
        }

        // Quando o processo morre, libera os recursos para re-init na próxima abertura
        if (proc) {
            proc.onDestroy = () => {
                if (this.timerId) {
                    if (typeof proc.clearInterval === 'function') {
                        proc.clearInterval(this.timerId);
                    } else {
                        window.clearInterval(this.timerId);
                    }
                    this.timerId = null;
                }
                this.initialized = false;
                this.hasClock = false;
                this.activeProc = null;
            };
        }
    },

    renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        const header = document.getElementById('cal-month-year');
        if (!grid) return;

        const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const m = this.currentDate.getMonth();
        const y = this.currentDate.getFullYear();

        if (header) header.textContent = `${months[m]} ${y}`;

        grid.innerHTML = '';
        ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].forEach(d => {
            const h = document.createElement('div');
            h.className = 'cal-day-header';
            h.textContent = d;
            grid.appendChild(h);
        });

        const firstDay = new Date(y, m, 1).getDay();
        const totalDays = new Date(y, m + 1, 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            grid.appendChild(document.createElement('div'));
        }

        const today = new Date().getDate();
        for (let day = 1; day <= totalDays; day++) {
            const el = document.createElement('div');
            el.className = 'cal-day';
            el.textContent = day;
            if (day === today) el.classList.add('is-selected');
            el.onclick = () => {
                document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('is-selected'));
                el.classList.add('is-selected');
            };
            grid.appendChild(el);
        }
    },

    startAnalogClock(proc) {
        const canvas = document.getElementById('analog-clock-canvas');
        if (!canvas || this.hasClock) return;
        this.hasClock = true;
        const ctx = canvas.getContext('2d');

        function drawClock() {
            const now = new Date();
            const digitalEl = document.getElementById('digital-time-display');
            if (digitalEl) digitalEl.textContent = now.toLocaleTimeString('pt-BR');

            ctx.clearRect(0, 0, 130, 130);
            const cx = 65, cy = 65, r = 58;

            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

            for (let i = 0; i < 12; i++) {
                const angle = (i * Math.PI) / 6;
                const x1 = cx + Math.cos(angle) * (r - 8);
                const y1 = cy + Math.sin(angle) * (r - 8);
                const x2 = cx + Math.cos(angle) * (r - 2);
                const y2 = cy + Math.sin(angle) * (r - 2);
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            }

            const hr = now.getHours() % 12 + now.getMinutes() / 60;
            const min = now.getMinutes() + now.getSeconds() / 60;
            const sec = now.getSeconds();

            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.sin(hr * (Math.PI / 6)) * 32, cy - Math.cos(hr * (Math.PI / 6)) * 32);
            ctx.stroke();

            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.sin(min * (Math.PI / 30)) * 44, cy - Math.cos(min * (Math.PI / 30)) * 44);
            ctx.stroke();

            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.sin(sec * (Math.PI / 30)) * 48, cy - Math.cos(sec * (Math.PI / 30)) * 48);
            ctx.stroke();

            ctx.fillStyle = '#000000';
            ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
        }

        // Armazena e monitora a referência do timer para descarte seguro
        if (this.timerId) {
            window.clearInterval(this.timerId);
            this.timerId = null;
        }

        if (proc && typeof proc.setInterval === 'function') {
            this.timerId = proc.setInterval(drawClock, 1000);
        } else {
            this.timerId = window.setInterval(drawClock, 1000);
        }
        drawClock();
    }
};

// ============================================================
// 3.5. CLIENTE DE E-MAIL RETRÔ: OUTLOOK EXPRESS 98 / CONTATO
// ============================================================
const MailApp = {
    contactEmail: USER_PROFILE.email,
    activeProc: null,

    init(proc) {
        this.activeProc = proc;
        this.contactEmail = USER_PROFILE.email;
        const win = document.getElementById('win-mail');
        if (!win) return;

        const toInput = document.getElementById('mail-to');
        const fromInput = document.getElementById('mail-from');
        const subjectInput = document.getElementById('mail-subject');
        const bodyInput = document.getElementById('mail-body');

        if (toInput && this.contactEmail) {
            toInput.value = this.contactEmail;
        }
        this.setStatus('Pronto para envio | 1 destinatário');

        const listen = (target, event, handler) => {
            if (!target) return;
            if (proc && typeof proc.addEventListener === 'function') {
                proc.addEventListener(target, event, handler);
            } else {
                target.addEventListener(event, handler);
            }
        };

        // Botões da Toolbar
        const btnSend = document.getElementById('btn-mail-send');
        const btnCopy = document.getElementById('btn-mail-copy');
        const btnToCopy = document.getElementById('btn-mail-to-copy');
        const btnAddr = document.getElementById('btn-mail-addressbook');
        const btnClear = document.getElementById('btn-mail-clear');

        listen(btnSend, 'click', () => this.sendMail());
        listen(btnCopy, 'click', () => this.copyEmail());
        listen(btnToCopy, 'click', () => this.copyEmail());
        listen(btnAddr, 'click', () => this.toggleAddressBook());
        listen(btnClear, 'click', () => this.clearFields());

        // Menus Dropdown
        const menuSend = document.getElementById('mail-menu-send');
        const menuCopy = document.getElementById('mail-menu-copy');
        const menuClear = document.getElementById('mail-menu-clear');
        const menuSelectAll = document.getElementById('mail-menu-selectall');
        const menuAddr = document.getElementById('mail-menu-toggle-book');
        const menuAbout = document.getElementById('mail-menu-about');
        const menuClose = document.getElementById('mail-menu-close');

        listen(menuSend, 'click', () => { this.hideMenus(); this.sendMail(); });
        listen(menuCopy, 'click', () => { this.hideMenus(); this.copyEmail(); });
        listen(menuClear, 'click', () => { this.hideMenus(); this.clearFields(); });
        listen(menuSelectAll, 'click', () => {
            this.hideMenus();
            if (bodyInput) bodyInput.select();
        });
        listen(menuAddr, 'click', () => { this.hideMenus(); this.toggleAddressBook(); });
        listen(menuAbout, 'click', () => {
            this.hideMenus();
            if (window.RetroDialog) {
                RetroDialog.show({
                    title: 'Sobre o Correio 98',
                    message: 'Outlook Express 98 / Windows Messaging v4.72\nCliente de Mensagens Retrô de ' + USER_PROFILE.name + '.\nComunicação direta, propostas e parcerias.',
                    type: 'info'
                });
            } else {
                alert('Outlook Express 98 / Windows Messaging v4.72\nCliente de Mensagens Retrô para Comunicação e Parcerias.');
            }
        });
        listen(menuClose, 'click', () => {
            this.hideMenus();
            WindowManager.closeWindow('mail');
        });

        // Botão de download do Currículo no catálogo
        const btnDownloadCv = document.getElementById('btn-download-cv');
        listen(btnDownloadCv, 'click', (e) => {
            e.preventDefault();
            this.downloadCV();
        });

        // Teardown hook do processo
        if (proc) {
            proc.onDestroy = () => {
                this.activeProc = null;
                this.hideMenus();
            };
        }
    },

    hideMenus() {
        if (typeof WindowManager.closeAllMenuDropdowns === 'function') {
            WindowManager.closeAllMenuDropdowns();
        }
    },

    setStatus(text, isTemporary = false) {
        const statusEl = document.getElementById('mail-status');
        if (!statusEl) return;
        statusEl.textContent = text;
        if (isTemporary) {
            const reset = () => {
                if (statusEl.textContent === text) {
                    statusEl.textContent = 'Pronto para envio | 1 destinatário';
                }
            };
            if (this.activeProc && typeof this.activeProc.setTimeout === 'function') {
                this.activeProc.setTimeout(reset, 3500);
            } else {
                setTimeout(reset, 3500);
            }
        }
    },

    copyEmail() {
        getRetroAudio().playClick('subtle');
        const email = this.contactEmail || USER_PROFILE.email;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(email).then(() => {
                this.setStatus('✓ E-mail copiado para a área de transferência!', true);
            }).catch(() => {
                this.fallbackCopy(email);
            });
        } else {
            this.fallbackCopy(email);
        }
    },

    fallbackCopy(text) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            this.setStatus('✓ E-mail copiado para a área de transferência!', true);
        } catch (err) {
            this.setStatus('E-mail: ' + text, true);
        }
    },

    sendMail() {
        getRetroAudio().playClick();
        const fromInput = document.getElementById('mail-from');
        const subjectInput = document.getElementById('mail-subject');
        const bodyInput = document.getElementById('mail-body');

        const fromVal = fromInput ? fromInput.value.trim() : '';
        const subjectVal = subjectInput ? subjectInput.value.trim() : '';
        const bodyVal = bodyInput ? bodyInput.value.trim() : '';

        if (!subjectVal && !bodyVal) {
            getRetroAudio().playErrorSound();
            if (window.RetroDialog) {
                RetroDialog.show({
                    title: 'Aviso de Envio',
                    message: 'Por favor, digite um Assunto ou preencha a Mensagem antes de enviar.',
                    type: 'warning',
                    onOk: () => { if (subjectInput) subjectInput.focus(); }
                });
            } else {
                alert('Por favor, digite um Assunto ou preencha a Mensagem antes de enviar.');
                if (subjectInput) subjectInput.focus();
            }
            return;
        }

        let fullBody = bodyVal;
        if (fromVal) {
            fullBody += `\n\n---\nRemetente: ${fromVal}`;
        }
        fullBody += `\nEnviado através do Outlook Express 98 (Portfolio Retrô de ${USER_PROFILE.name})`;

        const subjectParam = encodeURIComponent(subjectVal || 'Contato via Portfolio Retrô');
        const bodyParam = encodeURIComponent(fullBody);
        const mailtoUri = `mailto:${this.contactEmail}?subject=${subjectParam}&body=${bodyParam}`;

        this.setStatus('✉ Abrindo cliente de e-mail local...', true);

        const link = document.createElement('a');
        link.href = mailtoUri;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    toggleAddressBook() {
        getRetroAudio().playClick('subtle');
        const drawer = document.getElementById('mail-addressbook-panel');
        if (drawer) {
            drawer.classList.toggle('is-hidden');
            const isHidden = drawer.classList.contains('is-hidden');
            this.setStatus(isHidden ? 'Catálogo de contatos recolhido' : 'Catálogo de contatos aberto', true);
        }
    },

    clearFields() {
        getRetroAudio().playClick('subtle');
        const fromInput = document.getElementById('mail-from');
        const subjectInput = document.getElementById('mail-subject');
        const bodyInput = document.getElementById('mail-body');
        if (fromInput) fromInput.value = '';
        if (subjectInput) subjectInput.value = '';
        if (bodyInput) bodyInput.value = '';
        this.setStatus('Campos limpos. Pronto para nova mensagem.', true);
        if (fromInput) fromInput.focus();
    },

    downloadCV() {
        getRetroAudio().playClick();
        const cvContent = `===============================================================
CURRICULUM VITAE - ${USER_PROFILE.name.toUpperCase()}
===============================================================

DADOS PESSOAIS & CONTATO:
- Nome: ${USER_PROFILE.name}
- E-mail: ${USER_PROFILE.email}
- GitHub: ${USER_PROFILE.github}
- LinkedIn: ${USER_PROFILE.linkedin}
- Bio / Foco: ${USER_PROFILE.bio}
- Localização: Brasil / Remoto

FORMAÇÃO ACADÊMICA:
- Bacharelado em Ciência da Computação
  Unoeste - Universidade do Oeste Paulista

HABILIDADES & TECNOLOGIAS:
- Linguagens: C, C++, Python, JavaScript (ES6+), GLSL, SQL, HTML5 / CSS3
- Ambientes & Ferramentas: Linux (Shell/Bash, System Admin), Git, GitHub, Docker, VS Code
- Computação Gráfica & Web: Three.js, WebGL, Canvas 2D, Web Audio API, Interface Design
- Arquitetura: Estruturas de Dados, Algoritmos, Gerenciamento de Processos e Memória

DESTAQUES & PROJETOS TÉCNICOS:
- RetroOS 3D Workstation: Sistema operacional simulado multitarefa no navegador,
  com sintetizador de áudio procedural Web Audio e pipeline de shaders analógicos CRT.
- Algoritmos e Otimização: Implementações de alto desempenho em C e C++,
  processamento gráfico em tempo real com controle de VRAM e coleta de lixo eficiente.

===============================================================
Gerado via Outlook Express 98 - Workstation 3D Portfolio
===============================================================`;

        const blob = new Blob([cvContent], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'Curriculo_Guilherme_Gomes_Justi_2026.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        this.setStatus('✓ Currículo baixado com sucesso!', true);
    },

    close() {
        this.hideMenus();
    }
};

// ============================================================
// 3.6. PROPRIEDADES DO SISTEMA (SYSDM.CPL) / SOBRE MIM E GERENCIADOR DE DISPOSITIVOS
// ============================================================
const SystemPropertiesApp = {
    activeProc: null,
    selectedNode: null,

    init(proc) {
        this.activeProc = proc;
        const win = document.getElementById('win-about');
        if (!win) return;

        const listen = (target, event, handler) => {
            if (!target) return;
            if (proc && typeof proc.addEventListener === 'function') {
                proc.addEventListener(target, event, handler);
            } else {
                target.addEventListener(event, handler);
            }
        };

        // Abas
        const tabGeneral = document.getElementById('tab-sys-general');
        const tabDevMgr = document.getElementById('tab-sys-devmgr');
        const paneGeneral = document.getElementById('pane-sys-general');
        const paneDevMgr = document.getElementById('pane-sys-devmgr');

        const switchTab = (tabName) => {
            getRetroAudio().playClick('subtle');
            if (tabName === 'general') {
                if (tabGeneral) { tabGeneral.classList.add('is-active'); tabGeneral.setAttribute('aria-selected', 'true'); }
                if (tabDevMgr) { tabDevMgr.classList.remove('is-active'); tabDevMgr.setAttribute('aria-selected', 'false'); }
                if (paneGeneral) paneGeneral.classList.add('is-active');
                if (paneDevMgr) paneDevMgr.classList.remove('is-active');
            } else {
                if (tabGeneral) { tabGeneral.classList.remove('is-active'); tabGeneral.setAttribute('aria-selected', 'false'); }
                if (tabDevMgr) { tabDevMgr.classList.add('is-active'); tabDevMgr.setAttribute('aria-selected', 'true'); }
                if (paneGeneral) paneGeneral.classList.remove('is-active');
                if (paneDevMgr) paneDevMgr.classList.add('is-active');
            }
        };

        listen(tabGeneral, 'click', () => switchTab('general'));
        listen(tabDevMgr, 'click', () => switchTab('devmgr'));

        // Treeview Expander & Item Selection
        const treeview = document.getElementById('devmgr-treeview');
        const btnProps = document.getElementById('btn-devmgr-props');
        const btnRefresh = document.getElementById('btn-devmgr-refresh');

        if (treeview) {
            // Expanders (+ / -)
            const expanders = treeview.querySelectorAll('.tree-expander');
            expanders.forEach(exp => {
                listen(exp, 'click', (e) => {
                    e.stopPropagation();
                    getRetroAudio().playClick('subtle');
                    const node = exp.closest('.tree-node');
                    if (!node) return;
                    const isCollapsed = node.classList.toggle('is-collapsed');
                    node.classList.toggle('is-expanded', !isCollapsed);
                    exp.textContent = isCollapsed ? '+' : '-';
                    node.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
                });
            });

            // Node selection
            const nodeContents = treeview.querySelectorAll('.tree-node-content');
            nodeContents.forEach(content => {
                listen(content, 'click', (e) => {
                    e.stopPropagation();
                    getRetroAudio().playClick('subtle');
                    nodeContents.forEach(c => c.classList.remove('is-selected'));
                    content.classList.add('is-selected');
                    this.selectedNode = content;
                    if (btnProps) btnProps.disabled = false;
                });

                listen(content, 'dblclick', (e) => {
                    e.stopPropagation();
                    const expander = content.querySelector('.tree-expander');
                    if (expander) {
                        expander.click();
                    } else {
                        this.showDeviceProperties(content);
                    }
                });
            });
        }

        // Botão Propriedades de Dispositivo
        listen(btnProps, 'click', () => {
            if (this.selectedNode) {
                this.showDeviceProperties(this.selectedNode);
            }
        });

        // Botão Atualizar (Varredura de Hardware)
        listen(btnRefresh, 'click', () => {
            getRetroAudio().playClick();
            if (btnRefresh) {
                const originalText = btnRefresh.textContent;
                btnRefresh.textContent = 'Verificando...';
                btnRefresh.disabled = true;
                const done = () => {
                    btnRefresh.textContent = originalText;
                    btnRefresh.disabled = false;
                };
                if (proc && typeof proc.setTimeout === 'function') {
                    proc.setTimeout(done, 600);
                } else {
                    setTimeout(done, 600);
                }
            }
        });

        // Diálogo Botões OK / Cancelar
        const btnOk = document.getElementById('btn-sys-ok');
        const btnCancel = document.getElementById('btn-sys-cancel');

        listen(btnOk, 'click', () => WindowManager.closeWindow('about'));
        listen(btnCancel, 'click', () => WindowManager.closeWindow('about'));

        // Teardown
        if (proc) {
            proc.onDestroy = () => {
                this.activeProc = null;
                this.selectedNode = null;
            };
        }
    },

    showDeviceProperties(nodeContent) {
        getRetroAudio().playClick();
        const labelEl = nodeContent.querySelector('.tree-label');
        const deviceName = labelEl ? labelEl.textContent.trim() : 'Dispositivo do Sistema';
        const desc = nodeContent.dataset.desc || 'Controlador de tecnologia e arquitetura em perfeito funcionamento.';
        const isCat = nodeContent.classList.contains('is-category');

        const msg = [
            `Dispositivo: ${deviceName}`,
            `Tipo: ${isCat ? 'Controlador Central / Hub' : 'Módulo de Tecnologia / Driver'}`,
            `Status: O dispositivo está funcionando corretamente.`,
            `Certificação: Microsoft WHQL Certified v4.10 (RetroOS)`,
            `\nDescrição Técnica:`,
            `${desc}`,
            `\nLocal: Barramento PCI / Kernel RetroOS v4.10`
        ].join('\n');

        RetroDialog.show({
            title: deviceName + ' - Propriedades',
            message: msg,
            type: 'info'
        });
    }
};

// ============================================================
// 4. PROTETOR DE TELA ENGINE (SCREENSAVER EM TELA CHEIA)
// ============================================================
const ScreensaverEngine = {
    overlay: null,
    canvas: null,
    ctx: null,
    active: false,
    animId: null,

    init() {
        this.overlay = document.getElementById('screensaver-overlay');
        this.canvas = document.getElementById('screensaver-fullscreen-canvas');
        if (this.canvas) this.ctx = this.canvas.getContext('2d');

        const exit = () => {
            if (this.active) this.stop();
        };
        window.addEventListener('pointermove', exit);
        window.addEventListener('pointerdown', exit);
        window.addEventListener('keydown', exit);
    },

    start(type = 'starfield') {
        if (!this.overlay || !this.canvas) return;
        this.active = true;
        this.overlay.classList.remove('is-hidden');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        if (type === 'starfield') this.startStarfield();
        else if (type === 'matrix') this.startMatrix();
        else if (type === 'flying-windows') this.startFlyingWindows();
        else this.startStarfield();
    },

    stop() {
        this.active = false;
        if (this.animId) cancelAnimationFrame(this.animId);
        if (this.overlay) this.overlay.classList.add('is-hidden');
    },

    startStarfield() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        let stars = Array.from({ length: 300 }, () => ({
            x: Math.random() * w - w / 2,
            y: Math.random() * h - h / 2,
            z: Math.random() * w
        }));

        const loop = () => {
            if (!this.active) return;
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, w, h);
            this.ctx.fillStyle = '#ffffff';

            stars.forEach(s => {
                s.z -= 4;
                if (s.z <= 0) {
                    s.z = w;
                    s.x = Math.random() * w - w / 2;
                    s.y = Math.random() * h - h / 2;
                }

                const k = 250 / s.z;
                const px = s.x * k + w / 2;
                const py = s.y * k + h / 2;
                const size = Math.max(1, (w - s.z) / 100);

                if (px >= 0 && px < w && py >= 0 && py < h) {
                    this.ctx.fillRect(px, py, size, size);
                }
            });

            this.animId = requestAnimationFrame(loop);
        };
        loop();
    },

    startMatrix() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cols = Math.floor(w / 18);
        const ypos = Array(cols).fill(0);
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

        const loop = () => {
            if (!this.active) return;
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
            this.ctx.fillRect(0, 0, w, h);
            this.ctx.fillStyle = '#00ff41';
            this.ctx.font = '16px monospace';

            ypos.forEach((y, ind) => {
                const text = chars.charAt(Math.floor(Math.random() * chars.length));
                const x = ind * 18;
                this.ctx.fillText(text, x, y);
                if (y > 100 + Math.random() * 10000) ypos[ind] = 0;
                else ypos[ind] = y + 18;
            });

            this.animId = requestAnimationFrame(loop);
        };
        loop();
    },

    startFlyingWindows() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        let x = w / 2, y = h / 2, dx = 4, dy = 3;

        const loop = () => {
            if (!this.active) return;
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            this.ctx.fillRect(0, 0, w, h);

            x += dx;
            y += dy;
            if (x <= 40 || x >= w - 80) dx = -dx;
            if (y <= 40 || y >= h - 80) dy = -dy;

            this.ctx.fillStyle = '#ff0000'; this.ctx.fillRect(x, y, 20, 20);
            this.ctx.fillStyle = '#00ff00'; this.ctx.fillRect(x + 22, y, 20, 20);
            this.ctx.fillStyle = '#0000ff'; this.ctx.fillRect(x, y + 22, 20, 20);
            this.ctx.fillStyle = '#ffff00'; ctx.fillRect(x + 22, y + 22, 20, 20);

            this.animId = requestAnimationFrame(loop);
        };
        loop();
    }
};

// ============================================================
// 4.5. SISTEMA DE DIÁLOGOS NATIVOS RETRÔ (RETRODIALOG SINGLETON)
// ============================================================
const RetroDialog = {
    overlayEl: null,
    dialogEl: null,
    titleEl: null,
    msgEl: null,
    iconEl: null,
    okBtn: null,
    closeBtn: null,
    currentOnOk: null,

    init() {
        if (this.overlayEl) return;
        this.overlayEl = document.getElementById('retro-dialog-overlay');
        this.dialogEl = document.getElementById('retro-dialog-win');
        this.titleEl = document.getElementById('retro-dialog-title');
        this.msgEl = document.getElementById('retro-dialog-msg');
        this.iconEl = document.getElementById('retro-dialog-icon');
        this.okBtn = document.getElementById('btn-retro-dialog-ok');
        this.closeBtn = document.getElementById('btn-retro-dialog-close');

        if (!this.overlayEl) return;

        const dismiss = () => {
            SoundEngine.playClick('subtle');
            this.hide();
            if (typeof this.currentOnOk === 'function') {
                const cb = this.currentOnOk;
                this.currentOnOk = null;
                cb();
            }
        };

        if (this.okBtn) this.okBtn.onclick = dismiss;
        if (this.closeBtn) this.closeBtn.onclick = dismiss;

        window.addEventListener('keydown', (e) => {
            if (!this.overlayEl || this.overlayEl.classList.contains('is-hidden')) return;
            if (e.key === 'Escape' || e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                dismiss();
            }
        });
    },

    show({ title = 'Mensagem do Sistema', message = '', type = 'info', onOk = null } = {}) {
        this.init();
        if (!this.overlayEl || !this.dialogEl) return;

        this.currentOnOk = onOk;
        if (this.titleEl) this.titleEl.textContent = title;
        if (this.msgEl) this.msgEl.textContent = message;

        if (this.iconEl) {
            this.iconEl.className = 'retro-dialog-icon-box';
            if (type === 'error') {
                this.iconEl.classList.add('icon-dialog-error');
                SoundEngine.playChordError();
            } else if (type === 'warning') {
                this.iconEl.classList.add('icon-dialog-warning');
                SoundEngine.playAsterisk();
            } else {
                this.iconEl.classList.add('icon-dialog-info');
                SoundEngine.playAsterisk();
            }
        }

        this.overlayEl.classList.remove('is-hidden');
        this.dialogEl.classList.remove('is-hidden');

        setTimeout(() => {
            if (this.okBtn) this.okBtn.focus();
        }, 40);
    },

    hide() {
        if (this.overlayEl) this.overlayEl.classList.add('is-hidden');
        if (this.dialogEl) this.dialogEl.classList.add('is-hidden');
    }
};

window.RetroDialog = RetroDialog;
window.alert = (msg) => RetroDialog.show({ message: String(msg), type: 'info' });

// ============================================================
// 4.6. DICA DO DIA DO WINDOWS 98 (ONBOARDING PARA RECRUTADORES)
// ============================================================
const TipOfTheDay = {
    overlayEl: null,
    winEl: null,
    chkEl: null,
    btnClose: null,
    btnCloseTop: null,
    btnProjects: null,

    init() {
        this.overlayEl = document.getElementById('tip-dialog-overlay');
        this.winEl = document.getElementById('win-tip');
        this.chkEl = document.getElementById('chk-show-tips-startup');
        this.btnClose = document.getElementById('btn-tip-close');
        this.btnCloseTop = document.getElementById('btn-tip-close-top');
        this.btnProjects = document.getElementById('btn-tip-open-projects');

        if (!this.overlayEl || !this.winEl) return;

        const savedPref = localStorage.getItem('retro_show_tips');
        const shouldShow = savedPref === null ? true : savedPref === 'true';

        if (this.chkEl) {
            this.chkEl.checked = shouldShow;
            this.chkEl.onchange = (e) => {
                localStorage.setItem('retro_show_tips', e.target.checked ? 'true' : 'false');
            };
        }

        const dismiss = () => {
            this.hide();
            SoundEngine.unlock().then(() => {
                if (!SoundEngine.hasPlayedStartup && SoundEngine.canPlay()) {
                    SoundEngine.hasPlayedStartup = true;
                    SoundEngine.playStartupJingle();
                }
            });
        };

        if (this.btnClose) this.btnClose.onclick = dismiss;
        if (this.btnCloseTop) this.btnCloseTop.onclick = dismiss;

        if (this.btnProjects) {
            this.btnProjects.onclick = () => {
                dismiss();
                WindowManager.openWindow('explorer', 'projetos');
            };
        }

        window.addEventListener('keydown', (e) => {
            if (!this.overlayEl || this.overlayEl.classList.contains('is-hidden')) return;
            if (e.key === 'Escape' || e.key === 'Enter') {
                e.preventDefault();
                dismiss();
            }
        });

        if (shouldShow) {
            setTimeout(() => {
                this.show();
            }, 750);
        }
    },

    show() {
        if (!this.overlayEl || !this.winEl) return;
        this.overlayEl.classList.remove('is-hidden');
        this.winEl.classList.remove('is-hidden');
        // Inicialização inerte e silenciosa: o áudio só toca após o primeiro gesto real do usuário
        setTimeout(() => {
            if (this.btnClose) this.btnClose.focus();
        }, 50);
    },

    hide() {
        if (this.overlayEl) this.overlayEl.classList.add('is-hidden');
        if (this.winEl) this.winEl.classList.add('is-hidden');
    }
};

window.TipOfTheDay = TipOfTheDay;

// ============================================================
// 5. INICIALIZAÇÃO DE EVENTOS GLOBAIS DA UI & BANDEJA
// ============================================================
function initSystemUI() {
    RetroDialog.init();
    TipOfTheDay.init();
    WindowManager.init();
    DesktopManager.init();
    ExplorerApp.init();
    ScreensaverEngine.init();

    // Restaura configurações salvas de exibição, tema e CRT do usuário
    const savedCrt = localStorage.getItem('win_crt_mode') || 'subtle';
    const crtOverlay = document.getElementById('crt-overlay');
    if (crtOverlay) {
        crtOverlay.className = `crt-screen-overlay crt-mode-${DISPLAY_CRT_MODES.includes(savedCrt) ? savedCrt : 'subtle'}`;
    }

    const savedTheme = localStorage.getItem('win_theme');
    const retroOs = document.getElementById('retro-os');
    if (savedTheme && savedTheme !== 'win95-default' && DISPLAY_THEMES.includes(savedTheme) && retroOs) {
        retroOs.classList.add(`theme-${savedTheme}`);
    }

    const savedWpPreset = localStorage.getItem('win_wallpaper_preset');
    const savedWpCustom = localStorage.getItem('win_wallpaper_custom');
    const desktop = document.getElementById('retro-desktop');
    if (desktop) {
        if (savedWpCustom) {
            desktop.style.backgroundImage = `url(${savedWpCustom})`;
            desktop.style.backgroundSize = 'cover';
            desktop.style.backgroundPosition = 'center';
        } else if (savedWpPreset) {
            desktop.style.backgroundImage = '';
            desktop.className = `retro-desktop bg-${resolveWallpaperClass(savedWpPreset)}`;
        }
    }

    // Iniciar Menu
    const btnStart = document.getElementById('btn-start');
    if (btnStart) {
        btnStart.addEventListener('click', (e) => {
            e.stopPropagation();
            WindowManager.toggleStartMenu();
        });
    }

    // Menubars dropdowns
    document.querySelectorAll('.menu-item').forEach(item => {
        const dropdown = item.querySelector('.menu-dropdown');
        if (dropdown) {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const isShown = !dropdown.classList.contains('is-hidden') && dropdown.classList.contains('is-active');
                document.querySelectorAll('.menu-dropdown').forEach(d => {
                    d.classList.add('is-hidden');
                    d.classList.remove('is-active');
                });
                if (!isShown) {
                    dropdown.classList.remove('is-hidden');
                    dropdown.classList.add('is-active');
                }
            });
        }
    });

    window.addEventListener('click', () => {
        document.querySelectorAll('.menu-dropdown').forEach(d => {
            d.classList.add('is-hidden');
            d.classList.remove('is-active');
        });
        DesktopManager.hideContextMenus();
    });

    document.querySelectorAll('.start-item.has-submenu').forEach(item => {
        item.addEventListener('mouseenter', () => {
            document.querySelectorAll('.start-flyout-menu').forEach(m => {
                if (!item.contains(m)) m.classList.add('is-hidden');
            });
            const submenu = item.querySelector('.start-flyout-menu');
            if (submenu) submenu.classList.remove('is-hidden');
        });
    });

    document.querySelectorAll('.start-item[data-app], .start-item[data-target]').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            const app = btn.dataset.app;
            const param = btn.dataset.param;
            WindowManager.closeStartMenu();
            if (target === 'specs' || target === 'sobre' || target === 'projetos') {
                WindowManager.openWindow('explorer', target);
            } else if (app) {
                WindowManager.openWindow(app, param);
            }
        });
    });

    // Quick Launch Buttons
    document.querySelectorAll('.btn-quick-launch').forEach(btn => {
        btn.addEventListener('click', () => {
            const app = btn.dataset.app;
            const param = btn.dataset.param;
            if (app === 'desktop-toggle') {
                const hasOpen = Array.from(WindowManager.openApps.values()).some(e => !e.isMin);
                if (hasOpen) {
                    WindowManager.openApps.forEach((e, id) => WindowManager.minimizeWindow(id));
                } else {
                    WindowManager.openApps.forEach((e, id) => WindowManager.openWindow(id));
                }
            } else if (app) {
                WindowManager.openWindow(app, param);
            }
        });
    });

    // Desligar
    const btnShutdown = document.getElementById('btn-shutdown');
    if (btnShutdown) {
        btnShutdown.addEventListener('click', () => {
            WindowManager.closeStartMenu();
            if (typeof window.shutdownTo3D === 'function') window.shutdownTo3D();
            else if (typeof shutdownTo3D === 'function') shutdownTo3D();
        });
    }

    const btnConfirmShutdown = document.getElementById('btn-shutdown-confirm');
    if (btnConfirmShutdown) {
        btnConfirmShutdown.addEventListener('click', () => {
            const sel = document.querySelector('input[name="shutdown-opt"]:checked');
            const opt = sel ? sel.value : 'shutdown-3d';
            WindowManager.closeWindow('shutdown');
            if (opt === 'shutdown-3d') {
                if (typeof window.shutdownTo3D === 'function') window.shutdownTo3D();
                else if (typeof shutdownTo3D === 'function') shutdownTo3D();
            } else if (opt === 'restart') {
                if (typeof window.powerOffMachine === 'function') window.powerOffMachine();
                setTimeout(() => {
                    if (typeof window.powerOnToIdle === 'function') window.powerOnToIdle();
                }, 1000);
            }
        });
    }

    const btnCancelShutdown = document.getElementById('btn-shutdown-cancel');
    if (btnCancelShutdown) {
        btnCancelShutdown.addEventListener('click', () => {
            WindowManager.closeWindow('shutdown');
        });
    }

    // Diálogo Executar
    const btnRunOk = document.getElementById('btn-run-ok');
    const btnRunCancel = document.getElementById('btn-run-cancel');
    const runInput = document.getElementById('run-input');
    if (btnRunOk && runInput) {
        const executeRun = () => {
            const val = runInput.value.trim().toLowerCase();
            WindowManager.closeWindow('run');
            if (['calc', 'paint', 'notepad', 'snake', 'cobrinha', 'explorer', 'specs', 'display', 'taskmgr', 'mail', 'contato', 'outlook', 'email', 'sysdm.cpl', 'sysdm', 'sys', 'system', 'about', 'sndvol32', 'sndvol', 'volume'].includes(val)) {
                let targetApp = val;
                let targetParam = '';
                if (val === 'cobrinha') targetApp = 'snake';
                else if (val === 'contato' || val === 'outlook' || val === 'email') targetApp = 'mail';
                else if (['sysdm.cpl', 'sysdm', 'sys', 'system', 'about', 'specs'].includes(val)) targetApp = 'about';
                else if (['sndvol32', 'sndvol', 'volume'].includes(val)) {
                    const popup = document.getElementById('tray-vol-popup') || document.getElementById('tray-volume-popup');
                    const btn = document.getElementById('tray-vol-btn') || document.getElementById('tray-volume-btn');
                    if (popup) {
                        popup.classList.remove('is-hidden');
                        if (btn) {
                            btn.classList.add('is-pressed');
                            btn.setAttribute('aria-expanded', 'true');
                        }
                        const slider = document.getElementById('master-volume-slider');
                        if (slider) slider.focus();
                    }
                    SoundEngine.playAsterisk();
                    return;
                }
                WindowManager.openWindow(targetApp, targetParam);
            } else {
                SoundEngine.playChordError();
            }
        };
        btnRunOk.onclick = executeRun;
        runInput.onkeydown = (e) => { if (e.key === 'Enter') executeRun(); };
    }
    if (btnRunCancel) {
        btnRunCancel.onclick = () => WindowManager.closeWindow('run');
    }

    // Bandeja e Volume (sndvol32.exe)
    const btnTrayVolume = document.getElementById('tray-vol-btn') || document.getElementById('tray-volume-btn');
    const popupVolume = document.getElementById('tray-vol-popup') || document.getElementById('tray-volume-popup');
    const sliderVolume = document.getElementById('master-volume-slider');
    const muteVolume = document.getElementById('master-volume-mute');

    // Sincroniza estado inicial do slider e checkbox com o SoundEngine
    if (sliderVolume) {
        sliderVolume.value = Math.round(SoundEngine.getVolume() * 100);
    }
    if (muteVolume) {
        muteVolume.checked = SoundEngine.isMuted();
        const icon = document.getElementById('tray-volume-icon');
        if (icon) icon.classList.toggle('is-muted', SoundEngine.isMuted());
    }

    if (btnTrayVolume && popupVolume) {
        btnTrayVolume.onclick = (e) => {
            e.stopPropagation();
            SoundEngine.playClick('subtle');
            const isHidden = popupVolume.classList.toggle('is-hidden');
            btnTrayVolume.classList.toggle('is-pressed', !isHidden);
            btnTrayVolume.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
            if (!isHidden && sliderVolume) {
                sliderVolume.focus();
            }
        };

        // Fechar o popup automaticamente ao clicar fora dele
        window.addEventListener('pointerdown', (e) => {
            if (!popupVolume.classList.contains('is-hidden')) {
                if (!popupVolume.contains(e.target) && !btnTrayVolume.contains(e.target)) {
                    popupVolume.classList.add('is-hidden');
                    btnTrayVolume.classList.remove('is-pressed');
                    btnTrayVolume.setAttribute('aria-expanded', 'false');
                }
            }
        });
    }

    if (sliderVolume) {
        sliderVolume.oninput = (e) => {
            SoundEngine.setVolume(parseFloat(e.target.value));
        };
    }
    if (muteVolume) {
        muteVolume.onchange = (e) => {
            SoundEngine.setMute(e.target.checked);
        };
    }

    // Delegação de evento global para cliques táteis autênticos em controles
    document.addEventListener('click', (e) => {
        if (e._retroSoundHandled || e.defaultPrevented) return;

        const interactive = e.target.closest('button, .btn-retro, .tab-btn, .desktop-shortcut, .start-item, .menu-item, .dropdown-item, .context-item, [role="button"], [role="tab"]');
        if (!interactive) return;

        // Ignora elementos com manipuladores dedicados que já produzem seus próprios sons
        if (
            interactive.classList.contains('btn-win-close') ||
            interactive.classList.contains('btn-win-minimize') ||
            interactive.classList.contains('btn-win-maximize') ||
            interactive.id === 'tray-vol-btn' ||
            interactive.id === 'tray-volume-btn' ||
            interactive.dataset.soundHandled === 'true' ||
            interactive.closest('.no-click-sound')
        ) {
            return;
        }

        SoundEngine.playClick('subtle');
    }, { passive: true });

    // Relógio
    const btnClock = document.getElementById('taskbar-clock-btn');
    if (btnClock) {
        btnClock.onclick = () => {
            WindowManager.openWindow('datetime');
        };
    }

    const legacyTaskbarBtn = document.getElementById('taskbar-win-btn');
    if (legacyTaskbarBtn) {
        legacyTaskbarBtn.onclick = () => {
            const exp = document.getElementById('explorer');
            if (exp) {
                if (exp.classList.contains('is-hidden')) {
                    WindowManager.openWindow('explorer', 'projetos');
                } else if (WindowManager.activeAppId === 'explorer') {
                    WindowManager.minimizeWindow('explorer');
                } else {
                    WindowManager.focusWindow('explorer');
                }
            }
        };
    }

    const btnFolderBack = document.getElementById('btn-folder-back');
    if (btnFolderBack) {
        btnFolderBack.onclick = () => {
            ExplorerApp.showView('mycomputer');
        };
    }

    function updateTaskbarClock() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const clockEl = document.getElementById('taskbar-clock');
        if (clockEl) clockEl.textContent = `${h}:${m}`;
    }
    updateTaskbarClock();
    setInterval(updateTaskbarClock, 1000);
}

// Garante exatamente UMA execução de initSystemUI — independente do readyState
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSystemUI, { once: true });
} else {
    initSystemUI();
}

function renderHardwareSpecs() {
    const list = document.getElementById('specs-list');
    if (!list) return;

    const ua = navigator.userAgent;
    let gpuName = 'GPU WebGL 2.0 (DirectX/OpenGL Emulation)';
    try {
        const glCanvas = document.createElement('canvas');
        const gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
        if (gl) {
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            if (ext) gpuName = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || gpuName;
        }
    } catch (e) { }

    gpuName = gpuName.replace(/ANGLE \((.*)\)/, '$1').replace(/Direct3D.*vs_\d+_\d+/, '').trim();
    let os = 'Microsoft Windows 95 x86 Compatible';
    if (/Windows NT 10.0/i.test(ua)) os = 'Microsoft Windows 10/11 x64 (Simulado no Win95)';
    else if (/Mac OS X/i.test(ua)) os = 'Apple macOS (Simulado no Win95)';

    const cores = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} Núcleos de CPU` : 'Pentium Pro 200MHz';
    const ram = navigator.deviceMemory ? `~${navigator.deviceMemory} GB RAM (64MB EDO)` : '64 MB RAM EDO';
    const res = `${window.screen.width} x ${window.screen.height} px`;

    list.innerHTML = `
        <li><strong>Sistema Operacional:</strong> ${os}</li>
        <li><strong>Processador (CPU):</strong> ${cores}</li>
        <li><strong>Memória RAM:</strong> ${ram}</li>
        <li><strong>Controlador Gráfico (GPU):</strong> ${gpuName}</li>
        <li><strong>Resolução de Vídeo:</strong> ${res}</li>
        <li><strong>Sistema de Arquivos:</strong> FAT32 / VFAT</li>
    `;
}

// ============================================================
// 6. EXPOSIÇÃO GLOBAL NO WINDOW PARA DEVTOOLS E TESTES
// ============================================================
window.openAppWindow = (target) => WindowManager.openWindow('explorer', target);
window.closeAppWindow = () => WindowManager.closeWindow('explorer');
window.minimizeAppWindow = () => WindowManager.minimizeWindow('explorer');
window.toggleTaskbarWindow = () => WindowManager.openWindow('explorer');
window.toggleStartMenu = () => WindowManager.toggleStartMenu();
window.closeStartMenu = () => WindowManager.closeStartMenu();
window.showView = (name) => ExplorerApp.showView(name);

window.WindowManager = WindowManager;
window.DesktopManager = DesktopManager;
window.ExplorerApp = ExplorerApp;
window.NotepadApp = NotepadApp;
window.PaintApp = PaintApp;
window.SnakeApp = SnakeApp;
window.CalcApp = CalcApp;
window.DisplayApp = DisplayApp;
window.TaskMgrApp = TaskMgrApp;
window.DateTimeApp = DateTimeApp;
window.MailApp = MailApp;
window.SystemPropertiesApp = SystemPropertiesApp;
window.ScreensaverEngine = ScreensaverEngine;
window.SoundEngine = SoundEngine;
window.retroAudio = SoundEngine;
window.RetroDialog = RetroDialog;
window.TipOfTheDay = TipOfTheDay;
window.USER_PROFILE = USER_PROFILE;

// Namespace RetroOS
window.RetroOS.WindowManager = WindowManager;
window.RetroOS.DesktopManager = DesktopManager;
window.RetroOS.ExplorerApp = ExplorerApp;
window.RetroOS.NotepadApp = NotepadApp;
window.RetroOS.PaintApp = PaintApp;
window.RetroOS.SnakeApp = SnakeApp;
window.RetroOS.CalcApp = CalcApp;
window.RetroOS.DisplayApp = DisplayApp;
window.RetroOS.TaskMgrApp = TaskMgrApp;
window.RetroOS.DateTimeApp = DateTimeApp;
window.RetroOS.MailApp = MailApp;
window.RetroOS.SystemPropertiesApp = SystemPropertiesApp;
window.RetroOS.ScreensaverEngine = ScreensaverEngine;
window.RetroOS.SoundEngine = SoundEngine;
window.RetroOS.RetroDialog = RetroDialog;
window.RetroOS.TipOfTheDay = TipOfTheDay;
window.RetroOS.USER_PROFILE = USER_PROFILE;

