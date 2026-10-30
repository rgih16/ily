// ==========================================
// SINCRONIZAÇÃO EM TEMPO REAL ENTRE USUÁRIOS
// ==========================================
// Quando outra pessoa altera qualquer dado, o Supabase avisa por Realtime
// e a aba aberta é recarregada do banco. As outras abas já recarregam ao serem abertas.

const TABELAS_SINCRONIZADAS = [
    'pedidos', 'produtos', 'filamentos', 'filamento_compras',
    'impressoras', 'manutencoes', 'despesas', 'custos_fixos', 'config_financeira'
];

// O que recarregar em cada aba quando chega uma alteração
const RECARGA_POR_ABA = {
    'pedidos': async () => {
        if (typeof carregarFilamentos === 'function') await carregarFilamentos();
        if (typeof carregarPedidos === 'function') await carregarPedidos();
    },
    'catalogo': async () => {
        if (typeof carregarProdutos === 'function') await carregarProdutos();
    },
    'estoque': async () => {
        if (typeof carregarFilamentos === 'function') await carregarFilamentos();
    },
    'manutencao': async () => {
        if (typeof carregarDadosManutencao === 'function') await carregarDadosManutencao();
    },
    'despesas': async () => {
        if (typeof carregarCustosFixos === 'function') await carregarCustosFixos();
        if (typeof carregarAbaDespesas === 'function') await carregarAbaDespesas();
    },
    'financas': async () => {
        if (typeof carregarConfigFinanceira === 'function') await carregarConfigFinanceira();
        if (typeof carregarDadosFinanceiros === 'function') await carregarDadosFinanceiros();
    }
};

let canalRealtime = null;
let timerRecargaRealtime = null;
let recarregandoRealtime = false;
let recargaPendenteRealtime = false;
let canalJaConectou = false;

function abaVisivelAtual() {
    return Object.keys(RECARGA_POR_ABA).find(aba => {
        const el = document.getElementById(`aba-${aba}`);
        return el && !el.classList.contains('hidden');
    });
}

// Uma ação costuma alterar várias linhas de uma vez (pedido + estoque):
// espera um instante e recarrega uma vez só
function agendarRecargaRealtime() {
    clearTimeout(timerRecargaRealtime);
    timerRecargaRealtime = setTimeout(recarregarAbaAtual, 400);
}

async function recarregarAbaAtual() {
    if (recarregandoRealtime) {
        recargaPendenteRealtime = true;
        return;
    }
    const recarga = RECARGA_POR_ABA[abaVisivelAtual()];
    if (!recarga) return;

    recarregandoRealtime = true;
    try {
        await recarga();
    } catch (err) {
        console.error('Erro ao sincronizar alterações em tempo real:', err);
    } finally {
        recarregandoRealtime = false;
        if (recargaPendenteRealtime) {
            recargaPendenteRealtime = false;
            agendarRecargaRealtime();
        }
    }
}

function iniciarSincronizacaoTempoReal() {
    if (canalRealtime) return;
    canalJaConectou = false;

    canalRealtime = _supabase.channel('ilumy-sincronizacao');
    TABELAS_SINCRONIZADAS.forEach(tabela => {
        canalRealtime.on('postgres_changes', { event: '*', schema: 'public', table: tabela }, agendarRecargaRealtime);
    });

    canalRealtime.subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.warn('Sincronização em tempo real indisponível no momento:', status);
            }
            return;
        }
        // Ao reconectar (internet caiu, computador dormiu), busca o que mudou enquanto esteve fora
        if (canalJaConectou) agendarRecargaRealtime();
        canalJaConectou = true;
    });
}

async function pararSincronizacaoTempoReal() {
    clearTimeout(timerRecargaRealtime);
    if (!canalRealtime) return;
    const canal = canalRealtime;
    canalRealtime = null;
    await _supabase.removeChannel(canal);
}

// Garantia extra: ao voltar para a janela do sistema, confere se há novidades
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && canalRealtime) agendarRecargaRealtime();
});
