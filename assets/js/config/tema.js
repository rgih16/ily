// ==========================================
// TEMA CLARO / ESCURO
// ==========================================
// As cores do Tailwind usadas no sistema viram variáveis CSS. O tema escuro usa a
// paleta original; o claro inverte as escalas (fundo escuro vira claro, texto claro
// vira escuro), sem precisar reescrever as classes de cada tela.
// Carregado no <head>, antes da configuração do Tailwind.

const PALETA_TEMA = {
    slate:   ['f8fafc', 'f1f5f9', 'e2e8f0', 'cbd5e1', '94a3b8', '64748b', '475569', '334155', '1e293b', '0f172a', '020617'],
    red:     ['fef2f2', 'fee2e2', 'fecaca', 'fca5a5', 'f87171', 'ef4444', 'dc2626', 'b91c1c', '991b1b', '7f1d1d', '450a0a'],
    orange:  ['fff7ed', 'ffedd5', 'fed7aa', 'fdba74', 'fb923c', 'f97316', 'ea580c', 'c2410c', '9a3412', '7c2d12', '431407'],
    amber:   ['fffbeb', 'fef3c7', 'fde68a', 'fcd34d', 'fbbf24', 'f59e0b', 'd97706', 'b45309', '92400e', '78350f', '451a03'],
    green:   ['f0fdf4', 'dcfce7', 'bbf7d0', '86efac', '4ade80', '22c55e', '16a34a', '15803d', '166534', '14532d', '052e16'],
    emerald: ['ecfdf5', 'd1fae5', 'a7f3d0', '6ee7b7', '34d399', '10b981', '059669', '047857', '065f46', '064e3b', '022c22'],
    teal:    ['f0fdfa', 'ccfbf1', '99f6e4', '5eead4', '2dd4bf', '14b8a6', '0d9488', '0f766e', '115e59', '134e4a', '042f2e'],
    sky:     ['f0f9ff', 'e0f2fe', 'bae6fd', '7dd3fc', '38bdf8', '0ea5e9', '0284c7', '0369a1', '075985', '0c4a6e', '082f49'],
    blue:    ['eff6ff', 'dbeafe', 'bfdbfe', '93c5fd', '60a5fa', '3b82f6', '2563eb', '1d4ed8', '1e40af', '1e3a8a', '172554'],
    indigo:  ['eef2ff', 'e0e7ff', 'c7d2fe', 'a5b4fc', '818cf8', '6366f1', '4f46e5', '4338ca', '3730a3', '312e81', '1e1b4b'],
    purple:  ['faf5ff', 'f3e8ff', 'e9d5ff', 'd8b4fe', 'c084fc', 'a855f7', '9333ea', '7e22ce', '6b21a8', '581c87', '3b0764'],
    fuchsia: ['fdf4ff', 'fae8ff', 'f5d0fe', 'f0abfc', 'e879f9', 'd946ef', 'c026d3', 'a21caf', '86198f', '701a75', '4a044e'],
    pink:    ['fdf2f8', 'fce7f3', 'fbcfe8', 'f9a8d4', 'f472b6', 'ec4899', 'db2777', 'be185d', '9d174d', '831843', '500724'],
    rose:    ['fff1f2', 'ffe4e6', 'fecdd3', 'fda4af', 'fb7185', 'f43f5e', 'e11d48', 'be123c', '9f1239', '881337', '4c0519']
};
const TONS_TEMA = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

// Tema claro, cinzas: inversão completa. 900 (cards) vira branco e 950 (fundo) vira cinza bem claro.
const CLARO_SLATE = { 50: 950, 100: 900, 200: 800, 300: 700, 400: 600, 500: 500, 600: 400, 700: 300, 800: 200, 900: 'branco', 950: 50 };
// Tema claro, cores: textos claros (300/400) escurecem para ter contraste, fundos
// escuros (800-950) clareiam, e os tons de botão (500-700) continuam iguais.
const CLARO_CORES = { 50: 950, 100: 800, 200: 800, 300: 700, 400: 600, 500: 500, 600: 600, 700: 700, 800: 300, 900: 200, 950: 100 };

const TEMA_STORAGE_KEY = 'ilumy_tema';

function hexParaRgb(hex) {
    const n = parseInt(hex, 16);
    return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

// Cores para o tailwind.config: cada tom aponta para a variável CSS correspondente
const CORES_TAILWIND_TEMA = (() => {
    const cores = { white: 'rgb(var(--cor-white) / <alpha-value>)' };
    Object.keys(PALETA_TEMA).forEach(familia => {
        cores[familia] = {};
        TONS_TEMA.forEach(tom => {
            cores[familia][tom] = `rgb(var(--cor-${familia}-${tom}) / <alpha-value>)`;
        });
    });
    return cores;
})();

(function injetarVariaveisTema() {
    const escuro = ['--cor-white: 255 255 255;'];
    const claro = ['--cor-white: 15 23 42;'];

    Object.entries(PALETA_TEMA).forEach(([familia, tons]) => {
        const mapa = familia === 'slate' ? CLARO_SLATE : CLARO_CORES;
        TONS_TEMA.forEach((tom, i) => {
            escuro.push(`--cor-${familia}-${tom}: ${hexParaRgb(tons[i])};`);
            const alvo = mapa[tom];
            const rgbClaro = alvo === 'branco' ? '255 255 255' : hexParaRgb(tons[TONS_TEMA.indexOf(alvo)]);
            claro.push(`--cor-${familia}-${tom}: ${rgbClaro};`);
        });
    });

    // Texto branco sobre fundo colorido sólido (botões, etiquetas, logo) continua branco no tema claro
    const fundosSolidos = [];
    ['red', 'orange', 'amber', 'green', 'emerald', 'teal', 'sky', 'blue', 'indigo', 'purple', 'fuchsia', 'pink', 'rose'].forEach(familia => {
        [500, 600, 700].forEach(tom => fundosSolidos.push(`[class~="bg-${familia}-${tom}"]`));
    });
    fundosSolidos.push('[class*="bg-gradient-"]', '[class~="bg-shopee"]', '[class~="bg-site"]', '[class~="bg-wts"]');

    const style = document.createElement('style');
    style.id = 'variaveis-tema';
    style.textContent = `
        :root { ${escuro.join(' ')} }
        html.tema-claro { ${claro.join(' ')} color-scheme: light; }
        html.tema-claro :is(${fundosSolidos.join(', ')}) { --cor-white: 255 255 255; }
        html.tema-claro .glass-card { background: rgba(255, 255, 255, 0.9); border-color: rgba(15, 23, 42, 0.08); }
    `;
    document.head.appendChild(style);
})();

function temaAtual() {
    return document.documentElement.classList.contains('tema-claro') ? 'claro' : 'escuro';
}

function aplicarTema(tema) {
    document.documentElement.classList.toggle('tema-claro', tema === 'claro');
    try { localStorage.setItem(TEMA_STORAGE_KEY, tema); } catch (e) { /* navegador sem storage: segue só nesta sessão */ }
    if (typeof atualizarItemMenuTema === 'function') atualizarItemMenuTema();
}

// Cor atual de um tom da paleta, para quem desenha fora do CSS (gráficos)
function corDoTema(familia, tom) {
    const valor = getComputedStyle(document.documentElement).getPropertyValue(`--cor-${familia}-${tom}`).trim();
    return `rgb(${valor.split(' ').join(', ')})`;
}

// Aplica já no carregamento o último tema usado neste navegador, para a tela não piscar.
// Depois do login vale o tema salvo no usuário (auth.js).
(function aplicarTemaInicial() {
    let salvo = null;
    try { salvo = localStorage.getItem(TEMA_STORAGE_KEY); } catch (e) { /* sem storage */ }
    if (salvo === 'claro') document.documentElement.classList.add('tema-claro');
})();
