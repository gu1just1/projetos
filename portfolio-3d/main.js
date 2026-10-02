// ============================================================
// MAIN.JS - MOTOR 3D (THREE.JS), ÁUDIO E TRANSIÇÕES DE ESTADO
// Gerencia iluminação, materiais CRT, GLTF e interação de hardware
// ============================================================

// ============================================================
// 1. ÁUDIO DO SISTEMA (CONSUMO DIRETO DO SOUNDENGINE CENTRALIZADO)
// ============================================================
const retroAudio = window.SoundEngine || window.retroAudio || {
    init: () => {},
    unlock: () => {},
    playClick: () => {},
    playBootBeep: () => {},
    playFloppySeek: () => {},
    playStartupChime: () => {},
    playStartupJingle: () => {},
    playErrorSound: () => {},
    playChordError: () => {},
    playAsterisk: () => {},
    playMineExplode: () => {},
    playWinFanfare: () => {}
};
window.retroAudio = retroAudio;

// ============================================================
// 2. MÁQUINA DE ESTADOS DO SISTEMA E FLUXO DE HARDWARE 3D
// ============================================================
const STATES = {
    POWER_OFF: 'POWER_OFF',
    POWER_ON_IDLE: 'POWER_ON_IDLE',
    BOOTING: 'BOOTING',
    OS_OPEN: 'OS_OPEN'
};

let currentState = STATES.POWER_OFF;
let bootTimeoutId = null;
let typeBootTimeoutId = null;

// ============================================================
// 3. CENA, CÂMERA & RENDERIZADOR THREE.JS
// ============================================================
const canvas = document.getElementById('webgl-canvas');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
const cameraDefaultPos = new THREE.Vector3(0, 0.5, 7.5);
const cameraDefaultLook = new THREE.Vector3(0, 0, 0);
const cameraFocusPos = new THREE.Vector3(0, 0.6, 3.1);
const cameraFocusLook = new THREE.Vector3(0, 0.6, 0.5);

camera.position.copy(cameraDefaultPos);

let renderer;
try {
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
    });
} catch (err) {
    console.error('❌ WebGL indisponível:', err);
    canvas.style.display = 'none';
    const fallback = document.createElement('div');
    fallback.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0e1017;color:#e2e8f0;font-family:IBM Plex Mono,monospace;padding:32px;text-align:center;';
    fallback.textContent = 'Navegador sem suporte a WebGL. Ative a aceleração de hardware.';
    document.body.appendChild(fallback);
    throw err;
}

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;

// Listener para redimensionamento de tela mantendo a restrição de HiDPI
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
window.addEventListener('resize', onWindowResize);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.minDistance = 3.8;
controls.maxDistance = 9.5;
controls.target.copy(cameraDefaultLook);
controls.update();

const currentTargetPos = cameraDefaultPos.clone();
const currentTargetLook = cameraDefaultLook.clone();

const fillLight = new THREE.HemisphereLight(0xe2e8f0, 0x1e293b, 0.6);
scene.add(fillLight);

const keyLight = new THREE.DirectionalLight(0xfff3e0, 1.8);
keyLight.position.set(4, 6, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.width = 2048;
keyLight.shadow.mapSize.height = 2048;
scene.add(keyLight);

const rimLight = new THREE.SpotLight(0x38bdf8, 2.5);
rimLight.position.set(-5, 3, -4);
rimLight.angle = Math.PI / 3;
rimLight.penumbra = 0.8;
scene.add(rimLight);

const pivotGroup = new THREE.Group();
scene.add(pivotGroup);

const floorGeo = new THREE.PlaneGeometry(30, 30);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x16181f, roughness: 0.85, metalness: 0.1 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.2;
floor.receiveShadow = true;
scene.add(floor);

let modelReady = false;

function createScreenTexture() {
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 1024;
    screenCanvas.height = 1024;
    const sCtx = screenCanvas.getContext('2d');

    sCtx.fillStyle = '#06160b';
    sCtx.fillRect(0, 0, 1024, 1024);

    sCtx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    for (let y = 0; y < 1024; y += 4) {
        sCtx.fillRect(0, y, 1024, 2);
    }

    sCtx.save();
    sCtx.translate(512, 512);
    sCtx.rotate(-Math.PI / 2);
    sCtx.translate(-512, -512);

    sCtx.textAlign = 'center';
    sCtx.shadowColor = '#39ff74';
    sCtx.shadowBlur = 14;

    sCtx.fillStyle = '#39ff74';
    sCtx.font = 'bold 50px "IBM Plex Mono", monospace';
    sCtx.fillText('MICROSOFT WINDOWS 95', 512, 240);

    sCtx.font = 'bold 30px "IBM Plex Mono", monospace';
    sCtx.fillText('================================', 512, 310);
    sCtx.fillText('SISTEMA OPERACIONAL: PRONTO', 512, 380);
    sCtx.fillText('MEMÓRIA: VERIFICADA 64MB OK', 512, 450);
    sCtx.fillText('DISPOSITIVO: ONLINE VESA 2.0', 512, 520);
    sCtx.fillText('STATUS: AGUARDANDO OPERADOR', 512, 590);
    sCtx.fillText('--------------------------------', 512, 660);

    sCtx.fillStyle = '#66ff99';
    sCtx.shadowBlur = 24;
    sCtx.font = 'bold 36px "IBM Plex Mono", monospace';
    sCtx.fillText('> CLIQUE NA TELA PARA ABRIR <', 512, 770);
    sCtx.restore();

    const vignette = sCtx.createRadialGradient(512, 512, 260, 512, 512, 530);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.65)');
    sCtx.fillStyle = vignette;
    sCtx.fillRect(0, 0, 1024, 1024);

    const tex = new THREE.CanvasTexture(screenCanvas);
    tex.flipY = false;
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    return tex;
}

const screenTexture = createScreenTexture();

let powerBtnMesh = null;
let screenMesh = null;
let screenMaterial = null;
let powerBtnMaterial = null;
let powerBtnInitialPos = new THREE.Vector3();

function ensureEmissiveCapable(mesh, material, arrayIndex = -1) {
    if (!material) return null;
    material.transparent = false;
    material.opacity = 1.0;
    material.depthWrite = true;
    material.alphaTest = 0;

    if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial || (material.emissive && typeof material.emissive.set === 'function')) {
        return material;
    }

    const upgraded = new THREE.MeshStandardMaterial({
        color: material.color ? material.color.clone() : new THREE.Color(0xffffff),
        map: material.map || null,
        roughness: material.roughness !== undefined ? material.roughness : 0.4,
        metalness: material.metalness !== undefined ? material.metalness : 0.1,
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
        name: material.name || 'UpgradedMaterial'
    });

    if (Array.isArray(mesh.material)) {
        if (arrayIndex >= 0) mesh.material[arrayIndex] = upgraded;
        else {
            const idx = mesh.material.indexOf(material);
            if (idx !== -1) mesh.material[idx] = upgraded;
        }
    } else {
        mesh.material = upgraded;
    }
    return upgraded;
}

function processModelScene(gltf) {
    const model = gltf.scene;

    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }

        if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];

            mats.forEach((mat, idx) => {
                if (!mat) return;
                if (mat.map) {
                    mat.map.encoding = THREE.sRGBEncoding;
                    mat.map.needsUpdate = true;
                }

                const mName = (mat.name || '').toLowerCase();
                const cName = (child.name || '').toLowerCase();

                if (mName.includes('button') || mName.includes('power') || mName.includes('btn') || cName.includes('button') || cName.includes('power')) {
                    const fixedMat = ensureEmissiveCapable(child, mat, idx);
                    powerBtnMesh = child;
                    powerBtnMaterial = fixedMat;
                    child.userData.isPowerButton = true;

                    fixedMat.color = new THREE.Color(0xb5382b);
                    fixedMat.emissive = new THREE.Color(0x330000);
                    fixedMat.emissiveIntensity = 0.25;
                    fixedMat.roughness = 0.4;
                    fixedMat.metalness = 0.1;
                    fixedMat.needsUpdate = true;

                    if (!Array.isArray(child.material)) {
                        powerBtnInitialPos.copy(child.position);
                    }
                }

                if (mName.includes('screen') || mName.includes('crt') || mName.includes('display') || cName.includes('screen') || cName.includes('crt') || cName.includes('display')) {
                    const fixedMat = ensureEmissiveCapable(child, mat, idx);
                    screenMesh = child;
                    screenMaterial = fixedMat;
                    child.userData.isScreen = true;

                    fixedMat.transparent = false;
                    fixedMat.opacity = 1.0;
                    fixedMat.depthWrite = true;
                    fixedMat.color = new THREE.Color(0x0a0f0d);
                    fixedMat.roughness = 0.15;
                    fixedMat.metalness = 0.3;
                    fixedMat.needsUpdate = true;

                    if (child.geometry && child.geometry.attributes.uv) {
                        const uvAttr = child.geometry.attributes.uv;
                        let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
                        for (let i = 0; i < uvAttr.count; i++) {
                            const u = uvAttr.getX(i);
                            const v = uvAttr.getY(i);
                            minU = Math.min(minU, u); maxU = Math.max(maxU, u);
                            minV = Math.min(minV, v); maxV = Math.max(maxV, v);
                        }
                        const rangeU = maxU - minU || 1;
                        const rangeV = maxV - minV || 1;
                        for (let i = 0; i < uvAttr.count; i++) {
                            const normU = (uvAttr.getX(i) - minU) / rangeU;
                            const normV = (uvAttr.getY(i) - minV) / rangeV;
                            uvAttr.setXY(i, normU, normV);
                        }
                        uvAttr.needsUpdate = true;
                    }
                }
            });
        }
    });

    model.rotation.y = Math.PI / 2;
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (maxDim > 0) {
        const scale = 3.2 / maxDim;
        model.scale.setScalar(scale);
        model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        pivotGroup.add(model);
        floor.position.y = -(size.y * scale) / 2;
    }

    let btnHitCenter = null;
    let btnHitRadius = 0;
    if (powerBtnMesh) {
        const btnBox = new THREE.Box3().setFromObject(powerBtnMesh);
        btnHitCenter = btnBox.getCenter(new THREE.Vector3());
        const btnSize = btnBox.getSize(new THREE.Vector3());
        btnHitRadius = Math.max(0.22, Math.max(btnSize.x, btnSize.y, btnSize.z) * 1.3);

        const hitboxGeo = new THREE.SphereGeometry(btnHitRadius, 16, 16);
        const hitboxMat = new THREE.MeshBasicMaterial({ visible: false, depthWrite: false });
        const buttonHitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
        buttonHitbox.position.copy(btnHitCenter);
        buttonHitbox.userData.isPowerButton = true;
        buttonHitbox.name = 'power_button_hitbox';
        pivotGroup.add(buttonHitbox);
    }

    if (screenMesh) {
        const scrBox = new THREE.Box3().setFromObject(screenMesh);
        const scrCenter = scrBox.getCenter(new THREE.Vector3());
        const scrSize = scrBox.getSize(new THREE.Vector3());

        const minThickness = 0.2;
        const inflatedSize = new THREE.Vector3(
            Math.max(scrSize.x, minThickness),
            Math.max(scrSize.y, minThickness),
            Math.max(scrSize.z, minThickness)
        );

        if (btnHitCenter) {
            const margin = 0.04;
            const buttonTopY = btnHitCenter.y + btnHitRadius + margin;
            const screenBottomY = scrCenter.y - inflatedSize.y / 2;
            if (screenBottomY < buttonTopY) {
                const screenTopY = scrCenter.y + inflatedSize.y / 2;
                const newHeight = Math.max(0.08, screenTopY - buttonTopY);
                inflatedSize.y = newHeight;
                scrCenter.y = buttonTopY + newHeight / 2;
            }
        }

        const hitboxGeo = new THREE.BoxGeometry(inflatedSize.x, inflatedSize.y, inflatedSize.z);
        const hitboxMat = new THREE.MeshBasicMaterial({ visible: false, depthWrite: false });
        const screenHitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
        screenHitbox.position.copy(scrCenter);
        screenHitbox.userData.isScreen = true;
        screenHitbox.name = 'screen_hitbox';
        pivotGroup.add(screenHitbox);
    }

    setHardwareState(false);
    modelReady = true;
    updateHint();
}

function loadWorkstationModel() {
    const loader = new THREE.GLTFLoader();
    if (typeof MeshoptDecoder !== 'undefined') {
        loader.setMeshoptDecoder(MeshoptDecoder);
    }

    const candidatePaths = [
        './PC_workstation_web.glb',
        'PC_workstation_web.glb',
        './assets/models/PC_workstation_web.glb',
        'assets/models/PC_workstation_web.glb'
    ];

    let currentPathIndex = 0;
    function tryNextPath() {
        if (currentPathIndex >= candidatePaths.length) {
            if (hintText) hintText.textContent = 'Erro ao carregar o modelo 3D.';
            return;
        }
        const modelPath = candidatePaths[currentPathIndex++];
        loader.load(
            modelPath,
            (gltf) => processModelScene(gltf),
            (xhr) => {
                if (xhr.lengthComputable && hintText) {
                    const percent = Math.round((xhr.loaded / xhr.total) * 100);
                    hintText.textContent = `Carregando Workstation 3D (${percent}%)...`;
                }
            },
            () => tryNextPath()
        );
    }
    tryNextPath();
}
loadWorkstationModel();

let lastFrameTime = performance.now();
let lastRenderTime = performance.now();
let animationFrameId = null;

// Avalia se o render loop 3D deve operar em modo econômico (30 FPS)
function shouldThrottleRender() {
    if (currentState === STATES.OS_OPEN) return true;
    const wm = window.RetroOS?.WindowManager || window.WindowManager;
    if (wm && wm.openApps && wm.openApps.size > 0) {
        for (const entry of wm.openApps.values()) {
            if (!entry.isMin) return true;
        }
    }
    const hasVisible = document.querySelector('.explorer-window:not(.is-hidden), .win-dialog:not(.is-hidden)');
    return !!hasVisible;
}

function frameIndependentLerp(k60, deltaSeconds) {
    return 1 - Math.pow(1 - k60, deltaSeconds * 60);
}

function animate(currentTime = performance.now()) {
    animationFrameId = requestAnimationFrame(animate);

    // Pausa total caso a aba do navegador esteja oculta/minimizada
    if (document.hidden) return;

    // Throttling: 30 FPS (~33.33ms) com janelas ativas no OS; 60+ FPS no modo 3D puro
    const throttle = shouldThrottleRender();
    const minFrameInterval = throttle ? 33.33 : 0;
    const elapsed = currentTime - lastRenderTime;

    if (elapsed < minFrameInterval) {
        return; // Economiza ciclos de GPU pulando o redesenho
    }

    const delta = Math.min((currentTime - (lastFrameTime || currentTime)) / 1000, 0.1);
    lastFrameTime = currentTime;
    lastRenderTime = currentTime - (elapsed % (minFrameInterval || 16.67));

    const t = currentTime * 0.001;
    const idleFloatY = Math.sin(t * 1.35) * 0.024;
    const idleRotX = Math.sin(t * 1.15) * 0.006;
    const idleRotZ = Math.sin(t * 0.75) * 0.004;

    if (controls.enabled) {
        controls.update();
        pivotGroup.position.y = idleFloatY;
        pivotGroup.rotation.x = idleRotX;
        pivotGroup.rotation.z = idleRotZ;
    } else {
        const camLerp = frameIndependentLerp(0.07, delta);
        const pivotLerp = frameIndependentLerp(0.08, delta);

        camera.position.lerp(currentTargetPos, camLerp);
        controls.target.lerp(currentTargetLook, camLerp);

        pivotGroup.position.y += (0 - pivotGroup.position.y) * pivotLerp;
        pivotGroup.rotation.x += (0 - pivotGroup.rotation.x) * pivotLerp;
        pivotGroup.rotation.y += (0 - pivotGroup.rotation.y) * pivotLerp;
        pivotGroup.rotation.z += (0 - pivotGroup.rotation.z) * pivotLerp;
    }

    renderer.render(scene, camera);
}
animate(performance.now());

// Page Visibility API: Pausa total quando a aba estiver oculta e reinício suave ao focar
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    } else if (animationFrameId === null) {
        lastFrameTime = performance.now();
        lastRenderTime = performance.now();
        animate(performance.now());
    }
});

function setHardwareState(isOn) {
    if (screenMaterial) {
        screenMaterial.transparent = false;
        screenMaterial.opacity = 1.0;
        screenMaterial.depthWrite = true;

        if (isOn) {
            screenMaterial.map = screenTexture;
            screenMaterial.emissiveMap = null;
            screenMaterial.emissive = new THREE.Color(0x24a84d);
            screenMaterial.emissiveIntensity = 1.6;
            screenMaterial.color = new THREE.Color(0x2ee664);
            screenMaterial.roughness = 0.2;
            screenMaterial.metalness = 0.0;
        } else {
            screenMaterial.map = null;
            screenMaterial.emissiveMap = null;
            screenMaterial.emissive = new THREE.Color(0x000000);
            screenMaterial.emissiveIntensity = 0;
            screenMaterial.color.setHex(0x0a0f0d);
            screenMaterial.roughness = 0.15;
            screenMaterial.metalness = 0.3;
        }
        screenMaterial.needsUpdate = true;
    }
}

function animateButtonPress(callback) {
    if (powerBtnMaterial && powerBtnMaterial.emissive) {
        powerBtnMaterial.emissive = new THREE.Color(0xff4433);
        powerBtnMaterial.emissiveIntensity = 1.0;
        powerBtnMaterial.needsUpdate = true;
    }

    const isSeparateMesh = powerBtnMesh && powerBtnMesh !== screenMesh && !powerBtnMesh.userData.isScreen;
    if (!isSeparateMesh) {
        setTimeout(() => {
            if (powerBtnMaterial && powerBtnMaterial.emissive) {
                powerBtnMaterial.emissive = new THREE.Color(hoveredPowerBtn ? 0xff3322 : 0x330000);
                powerBtnMaterial.emissiveIntensity = hoveredPowerBtn ? 0.8 : 0.25;
                powerBtnMaterial.needsUpdate = true;
            }
            if (callback) callback();
        }, 120);
        return;
    }

    const startZ = powerBtnInitialPos.z;
    const offsetZ = 0.02;
    const duration = 120;
    const startTime = performance.now();

    function updatePress(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const depth = Math.sin(progress * Math.PI);
        powerBtnMesh.position.z = startZ - offsetZ * depth;

        if (progress < 1) {
            requestAnimationFrame(updatePress);
        } else {
            powerBtnMesh.position.z = startZ;
            if (powerBtnMaterial && powerBtnMaterial.emissive) {
                powerBtnMaterial.emissive = new THREE.Color(hoveredPowerBtn ? 0xff3322 : 0x330000);
                powerBtnMaterial.emissiveIntensity = hoveredPowerBtn ? 0.8 : 0.25;
                powerBtnMaterial.needsUpdate = true;
            }
            if (callback) callback();
        }
    }
    requestAnimationFrame(updatePress);
}

const hint = document.getElementById('hint');
const hintDot = document.getElementById('hint-dot');
const hintText = document.getElementById('hint-text');
const bootScreen = document.getElementById('boot-screen');
const bootTextEl = document.getElementById('boot-text');
const retroOs = document.getElementById('retro-os');
const retroDesktop = document.getElementById('retro-desktop');

const raycaster = new THREE.Raycaster();
const mouseCoords = new THREE.Vector2();
let hoveredPowerBtn = false;
let hoveredScreen = false;

const bootLines = [
    'WINDOWS 95 BOOTLOADER v4.0 [RELEASE 1995/2026]',
    '',
    'Detectando hardware Plug and Play......... OK',
    'Verificando memória RAM (64 MB)........... OK',
    'Controlador IDE / Disco Local (C:)........ OK',
    'Monitor CRT VESA Plug and Play............ OK',
    'Carregando MS-DOS 7.0 e VMM32.VXD......... OK',
    '',
    'Carregando Microsoft Windows 95...',
    'PROGRESS_BAR',
    '',
    '> SISTEMA OPERACIONAL ONLINE.'
];

function updateHint() {
    if (!hint || !hintText || !hintDot) return;
    if (!modelReady) {
        hintDot.classList.remove('is-on');
        return;
    }
    if (currentState === STATES.POWER_OFF) {
        hintDot.classList.remove('is-on');
        hintText.textContent = 'Pressione o botão vermelho ou clique na tela para ligar';
        hint.style.opacity = '1';
    } else if (currentState === STATES.POWER_ON_IDLE) {
        hintDot.classList.add('is-on');
        hintText.textContent = 'Computador ligado • Clique na tela para abrir o Windows 95 • Botão vermelho para desligar';
        hint.style.opacity = '1';
    } else if (currentState === STATES.OS_OPEN) {
        hintDot.classList.add('is-on');
        hintText.textContent = 'Windows 95 Ativo • Explore os programas e jogos';
        hint.style.opacity = '1';
    } else {
        hint.style.opacity = '0';
    }
}

function flushOrbitMomentum() {
    const wasDamping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = wasDamping;
}

function resetCameraToDefault(onComplete, targetPos = cameraDefaultPos, targetLook = cameraDefaultLook) {
    if (bootTimeoutId) clearTimeout(bootTimeoutId);
    if (typeBootTimeoutId) clearTimeout(typeBootTimeoutId);

    if (bootScreen) bootScreen.classList.remove('is-active');
    if (retroOs) retroOs.classList.remove('is-active');
    if (window.WindowManager) window.WindowManager.closeAll();

    currentTargetPos.copy(targetPos);
    currentTargetLook.copy(targetLook);

    setTimeout(() => {
        camera.position.copy(targetPos);
        controls.target.copy(targetLook);
        flushOrbitMomentum();
        controls.enabled = true;
        canvas.style.cursor = 'grab';
        if (onComplete) onComplete();
        updateHint();
    }, 450);
}

function powerOnToIdle() {
    if (currentState !== STATES.POWER_OFF || !modelReady) return;
    currentState = STATES.POWER_ON_IDLE;
    retroAudio.playClick();
    animateButtonPress();
    setHardwareState(true);
    controls.enabled = true;
    canvas.style.cursor = 'grab';
    updateHint();
}

function launchOSToOpen() {
    if (currentState !== STATES.POWER_ON_IDLE || !modelReady) return;
    currentState = STATES.BOOTING;
    retroAudio.playClick();

    controls.enabled = false;
    flushOrbitMomentum();
    canvas.style.cursor = 'default';

    currentTargetPos.copy(cameraFocusPos);
    currentTargetLook.copy(cameraFocusLook);
    updateHint();

    bootTimeoutId = setTimeout(() => {
        if (currentState !== STATES.BOOTING) return;
        if (bootScreen && bootTextEl) {
            bootScreen.classList.add('is-active');
            retroAudio.playBootBeep(820, 0.16);

            typeBootLines(() => {
                if (currentState !== STATES.BOOTING) return;
                retroAudio.playFloppySeek(4);
                bootScreen.classList.remove('is-active');

                if (retroOs) retroOs.classList.add('is-active');
                retroAudio.playStartupChime();
                if (window.WindowManager) window.WindowManager.openWindow('explorer', 'projetos');
                currentState = STATES.OS_OPEN;
                updateHint();
            });
        } else if (retroOs) {
            retroOs.classList.add('is-active');
            retroAudio.playStartupChime();
            if (window.WindowManager) window.WindowManager.openWindow('explorer', 'projetos');
            currentState = STATES.OS_OPEN;
            updateHint();
        }
    }, 450);
}

// ============================================================
// ROTINA UTILITÁRIA DE DESCARTE EM PROFUNDIDADE (VRAM DISPOSAL)
// ============================================================
function disposeMaterial(mat, preserveTextures = false) {
    if (!mat) return;
    const textureSlots = [
        'map', 'lightMap', 'bumpMap', 'normalMap', 'specularMap',
        'envMap', 'alphaMap', 'aoMap', 'displacementMap', 'emissiveMap',
        'gradientMap', 'metalnessMap', 'roughnessMap'
    ];
    if (!preserveTextures) {
        textureSlots.forEach((slot) => {
            if (mat[slot] && typeof mat[slot].dispose === 'function') {
                if (mat[slot] !== screenTexture) {
                    mat[slot].dispose();
                }
            }
        });
    }
    if (typeof mat.dispose === 'function') {
        mat.dispose();
    }
}

function disposeHierarchy(node, options = {}) {
    if (!node) return;
    node.traverse((child) => {
        if (child.isMesh) {
            if (child.geometry && typeof child.geometry.dispose === 'function') {
                child.geometry.dispose();
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach((m) => {
                        if (!options.preserveScreen || m !== screenMaterial) {
                            disposeMaterial(m, options.preserveTextures);
                        }
                    });
                } else {
                    if (!options.preserveScreen || child.material !== screenMaterial) {
                        disposeMaterial(child.material, options.preserveTextures);
                    }
                }
            }
        }
    });
}

// Rastreamento e expurgo de objetos 3D temporários
const transient3DObjects = new Set();

function registerTransient3D(obj) {
    if (obj) transient3DObjects.add(obj);
}

function cleanupTransient3D() {
    transient3DObjects.forEach((obj) => {
        if (obj.parent) obj.parent.remove(obj);
        disposeHierarchy(obj);
    });
    transient3DObjects.clear();
}

function powerOffMachine() {
    if (currentState === STATES.POWER_OFF) return;
    currentState = STATES.POWER_OFF;
    retroAudio.playClick();
    animateButtonPress();
    setHardwareState(false);
    cleanupTransient3D();
    resetCameraToDefault();
}

function shutdownTo3D() {
    retroAudio.playClick();
    if (window.WindowManager) window.WindowManager.closeStartMenu();
    if (retroOs) retroOs.classList.remove('is-active');
    if (window.WindowManager) window.WindowManager.closeAll();
    cleanupTransient3D();
    setHardwareState(true);
    resetCameraToDefault(() => {
        currentState = STATES.POWER_ON_IDLE;
    }, cameraDefaultPos, cameraDefaultLook);
}

function typeBootLines(onDone) {
    if (!bootTextEl) {
        if (onDone) onDone();
        return;
    }
    bootTextEl.textContent = '';
    let lineIndex = 0;

    function nextLine() {
        if (currentState !== STATES.BOOTING) return;
        if (lineIndex >= bootLines.length) {
            typeBootTimeoutId = setTimeout(onDone, 300);
            return;
        }
        const line = bootLines[lineIndex];

        if (line === 'PROGRESS_BAR') {
            lineIndex++;
            let progress = 0;
            const totalBlocks = 20;

            function animateProgress() {
                if (currentState !== STATES.BOOTING) return;
                progress++;
                const filled = '█'.repeat(progress);
                const empty = '░'.repeat(totalBlocks - progress);
                const pct = Math.round((progress / totalBlocks) * 100);

                const lines = bootTextEl.textContent.split('\n');
                if (lines.length > 0 && (lines[lines.length - 1].includes('█') || lines[lines.length - 1].includes('░'))) {
                    lines.pop();
                }
                lines.push(`[${filled}${empty}] ${pct}%`);
                bootTextEl.textContent = lines.join('\n');

                if (progress < totalBlocks) {
                    typeBootTimeoutId = setTimeout(animateProgress, 45);
                } else {
                    bootTextEl.textContent += '\n';
                    typeBootTimeoutId = setTimeout(nextLine, 120);
                }
            }
            animateProgress();
        } else {
            bootTextEl.textContent += line + '\n';
            lineIndex++;
            typeBootTimeoutId = setTimeout(nextLine, 100);
        }
    }
    nextLine();
}

function updateRaycastCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    mouseCoords.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouseCoords.y = -((clientY - rect.top) / rect.height) * 2 + 1;
}

function inspectHit(hit) {
    if (!hit || !hit.object) return { isButton: false, isScreen: false, matName: '', objName: '' };
    let matName = '';
    let objName = (hit.object.name || '').toLowerCase();

    if (hit.object.material) {
        if (Array.isArray(hit.object.material) && hit.face && hit.face.materialIndex !== undefined) {
            const mat = hit.object.material[hit.face.materialIndex];
            matName = (mat ? mat.name : '') || '';
        } else {
            matName = (hit.object.material.name || '');
        }
    }
    matName = matName.toLowerCase();

    const isButtonByMat = matName.includes('button') || matName.includes('power') || matName.includes('btn');
    const isScreenByMat = matName.includes('screen') || matName.includes('display') || matName.includes('crt');

    const isButton = isButtonByMat || (!matName && (
        (hit.object.userData && hit.object.userData.isPowerButton) ||
        objName.includes('button') || objName.includes('power') || objName.includes('btn')
    ));

    const isScreen = isScreenByMat || (!matName && (
        (hit.object.userData && hit.object.userData.isScreen) ||
        objName.includes('screen') || objName.includes('display') || objName.includes('crt')
    ));

    return { isButton, isScreen, matName, objName };
}

function performRaycastHover() {
    if (!modelReady) return;
    raycaster.setFromCamera(mouseCoords, camera);
    const intersects = raycaster.intersectObjects(pivotGroup.children, true);

    if (intersects.length === 0) {
        if (hoveredPowerBtn) {
            hoveredPowerBtn = false;
            if (powerBtnMaterial && powerBtnMaterial.emissive) {
                powerBtnMaterial.emissive = new THREE.Color(0x330000);
                powerBtnMaterial.emissiveIntensity = 0.25;
                powerBtnMaterial.needsUpdate = true;
            }
        }
        hoveredScreen = false;
        if (controls.enabled) canvas.style.cursor = 'grab';
        return;
    }

    let foundButton = false;
    let foundScreen = false;

    for (const hit of intersects) {
        const info = inspectHit(hit);
        if (info.isButton) { foundButton = true; break; }
        if (info.isScreen) { foundScreen = true; break; }
    }

    if (foundButton) {
        if (!hoveredPowerBtn) {
            hoveredPowerBtn = true;
            canvas.style.cursor = 'pointer';
            if (powerBtnMaterial && powerBtnMaterial.emissive) {
                powerBtnMaterial.emissive = new THREE.Color(0xff3322);
                powerBtnMaterial.emissiveIntensity = 0.8;
                powerBtnMaterial.needsUpdate = true;
            }
        }
    } else if (hoveredPowerBtn) {
        hoveredPowerBtn = false;
        if (powerBtnMaterial && powerBtnMaterial.emissive) {
            powerBtnMaterial.emissive = new THREE.Color(0x330000);
            powerBtnMaterial.emissiveIntensity = 0.25;
            powerBtnMaterial.needsUpdate = true;
        }
    }

    if (foundScreen && (currentState === STATES.POWER_OFF || currentState === STATES.POWER_ON_IDLE)) {
        hoveredScreen = true;
        canvas.style.cursor = 'pointer';
    } else {
        hoveredScreen = false;
    }

    if (!hoveredPowerBtn && !hoveredScreen && controls.enabled) {
        canvas.style.cursor = 'grab';
    }
}

function handleSceneInteraction() {
    if (!modelReady) return;
    raycaster.setFromCamera(mouseCoords, camera);
    const intersects = raycaster.intersectObjects(pivotGroup.children, true);

    if (intersects.length > 0) {
        let target = null;
        for (const hit of intersects) {
            const info = inspectHit(hit);
            if (info.isButton || info.isScreen) { target = info; break; }
        }
        if (!target) target = inspectHit(intersects[0]);

        if (target.isButton) {
            if (currentState === STATES.POWER_OFF) powerOnToIdle();
            else powerOffMachine();
            return;
        }

        if (target.isScreen) {
            if (currentState === STATES.POWER_OFF) powerOnToIdle();
            else if (currentState === STATES.POWER_ON_IDLE) launchOSToOpen();
            return;
        }
    }
}

let pointerStartX = 0;
let pointerStartY = 0;
let pointerStartTime = 0;

window.addEventListener('pointermove', (e) => {
    updateRaycastCoords(e.clientX, e.clientY);
    performRaycastHover();
});

canvas.addEventListener('pointerdown', (e) => {
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    pointerStartTime = performance.now();
    updateRaycastCoords(e.clientX, e.clientY);
});

canvas.addEventListener('pointerup', (e) => {
    const dx = e.clientX - pointerStartX;
    const dy = e.clientY - pointerStartY;
    const dist = Math.hypot(dx, dy);
    const duration = performance.now() - pointerStartTime;
    if (dist < 6 && duration < 400) {
        updateRaycastCoords(e.clientX, e.clientY);
        handleSceneInteraction();
    }
});

// ============================================================
// 4. EXPOSIÇÃO GLOBAL NO WINDOW PARA DEVTOOLS, OS CORE E TESTES
// ============================================================
window.STATES = STATES;
Object.defineProperty(window, 'currentState', {
    get() { return currentState; },
    set(v) { currentState = v; },
    configurable: true
});
Object.defineProperty(window, 'modelReady', {
    get() { return modelReady; },
    set(v) { modelReady = v; },
    configurable: true
});
Object.defineProperty(window, 'screenMaterial', {
    get() { return screenMaterial; },
    set(v) { screenMaterial = v; },
    configurable: true
});

window.powerOnToIdle = powerOnToIdle;
window.powerOffMachine = powerOffMachine;
window.launchOSToOpen = launchOSToOpen;
window.shutdownTo3D = shutdownTo3D;

window.camera = camera;
window.controls = controls;
window.renderer = renderer;
window.scene = scene;
window.retroAudio = retroAudio;
window.disposeHierarchy = disposeHierarchy;

// Namespace Engine3D (Alinhamento Arquitetural)
window.Engine3D = window.Engine3D || {};
window.Engine3D.STATES = STATES;
window.Engine3D.renderer = renderer;
window.Engine3D.scene = scene;
window.Engine3D.camera = camera;
window.Engine3D.controls = controls;
window.Engine3D.disposeHierarchy = disposeHierarchy;
window.Engine3D.disposeMaterial = disposeMaterial;
window.Engine3D.registerTransient3D = registerTransient3D;
window.Engine3D.cleanupTransient3D = cleanupTransient3D;
window.Engine3D.powerOnToIdle = powerOnToIdle;
window.Engine3D.powerOffMachine = powerOffMachine;
window.Engine3D.launchOSToOpen = launchOSToOpen;
window.Engine3D.shutdownTo3D = shutdownTo3D;

