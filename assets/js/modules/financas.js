// assets/js/modules/financas.js
//
// Onde cada informação fica gravada (Supabase):
// - config_financeira (linha única): taxas por canal, custo por hora de impressão e imposto (%).
// - pedidos: além da venda, cada pedido guarda os valores do dia em que foi criado
//   (custo_insumo, custo_maquina, taxa_estimada, imposto_estimado, frete_pago) e, ao receber,
//   o valor_liquido_recebido. Mudar a configuração depois não altera pedidos antigos.
// - despesas: todo gasto do negócio (consumíveis, frete, manutenção, impostos, lançamentos de custos fixos...).
// - custos_fixos: modelos recorrentes com vigência; geram um lançamento em "despesas" por mês.
// - filamento_compras: compras de filamento (viram estoque; o custo entra no DRE quando o filamento é usado).

let visaoFinanceiraAtual = 'competencia'; // 'competencia' ou 'caixa'
let chartEvolucaoInstance = null;
let chartCanaisInstance = null;

const CATEGORIAS_DESPESA = ['Custo fixo', 'Impostos', 'Consumíveis', 'Ferramentas', 'Frete', 'Manutenção & Peças', 'Marketing', 'Outros', 'Equipamentos / Investimento'];
// Investimento vira um bem da empresa: sai do caixa, mas não é gasto do mês na visão de vendas
const CATEGORIA_INVESTIMENTO = 'Equipamentos / Investimento';
const CORES_CATEGORIA = {
    'Equipamentos / Investimento': 'bg-purple-950/80 border-purple-700/60 text-purple-300',
    'Ferramentas': 'bg-orange-950/80 border-orange-700/60 text-orange-300',
    'Custo fixo': 'bg-indigo-950/80 border-indigo-700/60 text-indigo-300',
    'Impostos': 'bg-rose-950/80 border-rose-700/60 text-rose-300',
    'Consumíveis': 'bg-teal-950/80 border-teal-700/60 text-teal-300',
    'Frete': 'bg-sky-950/80 border-sky-700/60 text-sky-300',
    'Manutenção & Peças': 'bg-amber-950/80 border-amber-700/60 text-amber-300',
    'Marketing': 'bg-fuchsia-950/80 border-fuchsia-700/60 text-fuchsia-300',
    'Outros': 'bg-slate-800 border-slate-700 text-slate-300'
};
const CANAIS_VENDA = ['Shopee', 'Mercado Livre', 'Site', 'WhatsApp'];

const CONFIG_FINANCEIRA_PADRAO = {
    taxas_canais: {
        'Shopee': { pct: 15, fixa: 0 },
        'Mercado Livre': { pct: 10, fixa: 0 },
        'Site': { pct: 3, fixa: 0 },
        'WhatsApp': { pct: 0, fixa: 0 }
    },
    potencia_media_w: 150,
    tarifa_kwh: 0.90,
    depreciacao_hora: 0.50,
    imposto_pct: 0,
    // Precificação: margem sobre o custo de produção usada quando o produto não tem a sua
    margem_padrao_pct: 100,
    arredondar_90: true,
    // Site e WhatsApp: taxa da maquininha/gateway por forma de pagamento (somada à taxa do canal)
    taxas_pagamento: {
        'Pix': 0,
        'Dinheiro': 0,
        'Débito': 0,
        'Crédito': { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 },
        recebimento_padrao: 'na_hora',
        juros_cliente_padrao: false
    }
};
const FORMAS_PAGAMENTO = ['Pix', 'Dinheiro', 'Débito', 'Crédito'];
const MAX_PARCELAS = 12;
let configFinanceira = JSON.parse(JSON.stringify(CONFIG_FINANCEIRA_PADRAO));

// Função auxiliar para obter o cliente Supabase em qualquer escopo
function obterSupabaseClient() {
    if (typeof _supabase !== 'undefined' && _supabase) return _supabase;
    if (typeof window !== 'undefined') {
        if (window._supabase) return window._supabase;
        if (window.supabaseClient) return window.supabaseClient;
    }
    return null;
}

const moedaBR = (valor) => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Escapa texto digitado pelo usuário antes de inserir no HTML
function escaparHtml(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Extrai ano e mês de forma à prova de fusos horários
function extrairAnoMes(dataValor) {
    if (!dataValor) return null;
    const str = String(dataValor).trim();
    const match = str.match(/^(\d{4})-(\d{2})/);
    if (match) {
        return { ano: match[1], mes: match[2] };
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        return {
            ano: String(d.getFullYear()),
            mes: String(d.getMonth() + 1).padStart(2, '0')
        };
    }
    return null;
}

// "AAAA-MM-DD" do dia de hoje no fuso local
function hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Mês selecionado no filtro (AAAA-MM); preenche com o mês atual se vazio
function mesSelecionadoFinancas() {
    const inputMes = document.getElementById('filtro-financas-mes');
    if (inputMes && !inputMes.value) inputMes.value = hojeISO().slice(0, 7);
    return inputMes ? inputMes.value : hojeISO().slice(0, 7);
}

function ultimoDiaDoMes(anoMes) {
    const [ano, mes] = anoMes.split('-').map(Number);
    return `${anoMes}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;
}

// Função Global do Accordion
function toggleAccordion(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById('icon-' + id);
    if (el) {
        const estaEscondido = el.classList.contains('hidden');
        if (estaEscondido) {
            el.classList.remove('hidden');
            if (icon) icon.style.transform = 'rotate(0deg)';
        } else {
            el.classList.add('hidden');
            if (icon) icon.style.transform = 'rotate(-90deg)';
        }
    }
}

// ==========================================
// CONFIGURAÇÃO FINANCEIRA (BANCO)
// ==========================================
async function carregarConfigFinanceira() {
    try {
        const client = obterSupabaseClient();
        if (!client) return configFinanceira;

        const { data, error } = await client.from('config_financeira').select('*').eq('id', 1).single();
        if (error) throw error;

        if (data) {
            configFinanceira = {
                ...CONFIG_FINANCEIRA_PADRAO,
                ...data,
                taxas_canais: { ...CONFIG_FINANCEIRA_PADRAO.taxas_canais, ...(data.taxas_canais || {}) },
                taxas_pagamento: {
                    ...CONFIG_FINANCEIRA_PADRAO.taxas_pagamento,
                    ...(data.taxas_pagamento || {}),
                    'Crédito': { ...CONFIG_FINANCEIRA_PADRAO.taxas_pagamento['Crédito'], ...((data.taxas_pagamento || {})['Crédito'] || {}) }
                }
            };
        }

        // Taxas antigas salvas só neste navegador: leva para o banco uma única vez
        const taxasLocais = localStorage.getItem('ilumy3d_taxas_canais');
        if (taxasLocais) {
            try {
                const antigas = JSON.parse(taxasLocais);
                Object.entries(antigas || {}).forEach(([canal, pct]) => {
                    if (configFinanceira.taxas_canais[canal]) configFinanceira.taxas_canais[canal].pct = Number(pct) || 0;
                });
                await client.from('config_financeira').update({ taxas_canais: configFinanceira.taxas_canais, updated_at: new Date().toISOString() }).eq('id', 1);
            } catch (e) {
                console.error('Erro ao migrar taxas do navegador para o banco:', e);
            }
            localStorage.removeItem('ilumy3d_taxas_canais');
        }
    } catch (err) {
        console.error('Erro ao carregar configuração financeira:', err.message || err);
    }
    return configFinanceira;
}

function custoHoraImpressao(cfg = configFinanceira) {
    const energia = (Number(cfg.potencia_media_w) || 0) / 1000 * (Number(cfg.tarifa_kwh) || 0);
    return energia + (Number(cfg.depreciacao_hora) || 0);
}

function normalizarCanal(origem) {
    if (origem === 'Site Próprio') return 'Site';
    return origem || 'WhatsApp';
}

function taxaDoCanal(origem, cfg = configFinanceira) {
    const canal = normalizarCanal(origem);
    const taxa = (cfg.taxas_canais || {})[canal] || { pct: 0, fixa: 0 };
    return { pct: Number(taxa.pct) || 0, fixa: Number(taxa.fixa) || 0 };
}

// "02h 30m", "2:30" ou "2" (horas) -> minutos por unidade
function minutosDeImpressao(tempoStr) {
    if (!tempoStr) return 0;
    const str = String(tempoStr).toLowerCase();
    const h = str.match(/(\d+)\s*h/);
    const m = str.match(/(\d+)\s*m/);
    if (h || m) return (h ? parseInt(h[1], 10) * 60 : 0) + (m ? parseInt(m[1], 10) : 0);
    if (str.includes(':')) {
        const [hh, mm] = str.split(':');
        return (parseInt(hh, 10) || 0) * 60 + (parseInt(mm, 10) || 0);
    }
    return (parseFloat(str) || 0) * 60;
}

// Canais em que quem recebe o pagamento é a empresa (maquininha, app, gateway); nos marketplaces é a plataforma
const CANAIS_PAGAMENTO_PROPRIO = ['Site', 'WhatsApp'];

// % da forma de pagamento. Crédito com juros pagos pelo cliente usa a taxa de 1x (a diferença fica com ele)
function taxaFormaPagamento({ origem, formaPagamento, parcelas, jurosCliente }, cfg = configFinanceira) {
    if (!CANAIS_PAGAMENTO_PROPRIO.includes(normalizarCanal(origem)) || !formaPagamento) return 0;
    const tabela = cfg.taxas_pagamento || CONFIG_FINANCEIRA_PADRAO.taxas_pagamento;
    if (formaPagamento !== 'Crédito') return Number(tabela[formaPagamento]) || 0;
    const n = jurosCliente ? 1 : Math.min(Math.max(parseInt(parcelas, 10) || 1, 1), MAX_PARCELAS);
    return Number((tabela['Crédito'] || {})[n]) || 0;
}

// Valores congelados no pedido no momento da criação, pela configuração vigente
function calcularValoresFinanceirosPedido({ origem, valorUnitario, quantidade, tempoImpressao, formaPagamento, parcelas, jurosCliente }, cfg = configFinanceira) {
    const qtd = parseInt(quantidade, 10) || 1;
    const bruto = (Number(valorUnitario) || 0) * qtd;
    const taxa = taxaDoCanal(origem, cfg);
    const pctPagamento = taxaFormaPagamento({ origem, formaPagamento, parcelas, jurosCliente }, cfg);
    const horas = (minutosDeImpressao(tempoImpressao) * qtd) / 60;

    const arred = (v) => Math.round(v * 100) / 100;
    return {
        taxa_estimada: arred(bruto * ((taxa.pct + pctPagamento) / 100) + taxa.fixa * qtd),
        imposto_estimado: arred(bruto * ((Number(cfg.imposto_pct) || 0) / 100)),
        custo_maquina: arred(horas * custoHoraImpressao(cfg))
    };
}

// Composição financeira de um pedido. Usa os valores gravados no pedido; para pedidos antigos
// (sem esses campos) estima com a configuração e o custo médio atuais.
function financeiroDoPedido(p, filamentos = (typeof listaFilamentosGlobal !== 'undefined' ? listaFilamentosGlobal : [])) {
    const qtd = parseInt(p.quantidade_unidades || p.quantidade || 1, 10) || 1;
    const bruto = (Number(p.valor_total) || 0) * qtd;
    const estimado = calcularValoresFinanceirosPedido({
        origem: p.origem, valorUnitario: p.valor_total, quantidade: qtd, tempoImpressao: p.tempo_impressao,
        formaPagamento: p.forma_pagamento, parcelas: p.parcelas, jurosCliente: p.juros_cliente
    });

    const temLiquido = p.valor_liquido_recebido !== null && p.valor_liquido_recebido !== undefined && p.valor_liquido_recebido !== '';
    const taxa = temLiquido
        ? Math.max(bruto - Number(p.valor_liquido_recebido), 0)
        : (p.taxa_estimada != null ? Number(p.taxa_estimada) : estimado.taxa_estimada);

    // Filamento por item: [{ nome, filamento_id, peso_g, custo_total, gravado }]
    let filamentoItens = [];
    if (Array.isArray(p.custo_insumo_detalhe) && p.custo_insumo_detalhe.length > 0) {
        filamentoItens = p.custo_insumo_detalhe.map(item => ({
            nome: item.nome || 'Filamento',
            filamento_id: item.filamento_id,
            peso_g: Number(item.peso_g) || 0,
            custo_total: (Number(item.peso_g) || 0) * (Number(item.custo_g) || 0),
            gravado: true
        }));
    } else {
        const peso = Number(p.peso_consumido_g || 0);
        if (peso > 0) {
            let usados = (typeof resolverCarreteisDoInsumo === 'function') ? resolverCarreteisDoInsumo(p.insumo, filamentos) : [];
            if (usados.length === 0 && p.filamento_id) usados = (filamentos || []).filter(f => String(f.id) === String(p.filamento_id));
            if (usados.length === 0) {
                filamentoItens = [{ nome: 'Filamento não identificado', filamento_id: null, peso_g: peso, custo_total: peso * 0.09, gravado: false }];
            } else {
                const parte = peso / usados.length;
                filamentoItens = usados.map(f => ({
                    nome: `${f.material || ''} ${f.cor || ''}`.trim(),
                    filamento_id: f.id,
                    peso_g: parte,
                    custo_total: parte * (Number(f.custo_medio_g) > 0 ? Number(f.custo_medio_g) : 0.09),
                    gravado: false
                }));
            }
        }
    }

    const filamento = filamentoItens.reduce((acc, i) => acc + i.custo_total, 0);
    const maquina = p.custo_maquina != null ? Number(p.custo_maquina) : estimado.custo_maquina;
    const imposto = p.imposto_estimado != null ? Number(p.imposto_estimado) : estimado.imposto_estimado;
    const frete = Number(p.frete_pago || 0);
    const lucro = bruto - taxa - imposto - filamento - maquina - frete;

    return {
        bruto, taxa, taxaReal: temLiquido, imposto, filamento, filamentoItens, maquina, frete, lucro,
        horas: (minutosDeImpressao(p.tempo_impressao) * qtd) / 60,
        valoresGravados: p.taxa_estimada != null || p.custo_maquina != null
    };
}

// ==========================================
// PRECIFICAÇÃO DE PRODUTOS
// ==========================================
// Custo de produção de 1 unidade: filamento (peso × custo médio dos carretéis do produto) +
// máquina (horas × custo/hora) + embalagem e insumos. Sem custo médio cadastrado, usa R$ 0,09/g.
const CUSTO_FILAMENTO_PADRAO_G = 0.09;

function custoProducaoProduto(produto, filamentos = (typeof listaFilamentosGlobal !== 'undefined' ? listaFilamentosGlobal : []), cfg = configFinanceira) {
    const peso = Number(produto.peso_gramas) || 0;
    const carreteis = typeof resolverCarreteisDoInsumo === 'function' ? resolverCarreteisDoInsumo(produto.insumo_padrao, filamentos) : [];
    const custosG = carreteis.map(f => Number(f.custo_medio_g) > 0 ? Number(f.custo_medio_g) : CUSTO_FILAMENTO_PADRAO_G);
    const custoG = custosG.length ? custosG.reduce((a, b) => a + b, 0) / custosG.length : CUSTO_FILAMENTO_PADRAO_G;
    const horas = minutosDeImpressao(produto.tempo_impressao) / 60;

    const filamento = peso * custoG;
    const maquina = horas * custoHoraImpressao(cfg);
    const embalagem = Number(produto.custo_embalagem) || 0;
    return { filamento, maquina, embalagem, total: filamento + maquina + embalagem, peso, custoG, horas, filamentoEstimado: carreteis.length === 0 };
}

// % que sai do preço em cada canal: comissão + imposto (+ Pix nos canais próprios, que é a base deles)
function percentualDescontadoCanal(canal, cfg = configFinanceira) {
    const pctPix = CANAIS_PAGAMENTO_PROPRIO.includes(canal) ? taxaFormaPagamento({ origem: canal, formaPagamento: 'Pix' }, cfg) : 0;
    return taxaDoCanal(canal, cfg).pct + (Number(cfg.imposto_pct) || 0) + pctPix;
}

// Quanto cai na conta vendendo 1 unidade por "preco" no canal
function liquidoDoPrecoCanal(preco, canal, cfg = configFinanceira) {
    return preco * (1 - percentualDescontadoCanal(canal, cfg) / 100) - taxaDoCanal(canal, cfg).fixa;
}

// Preço terminando em ,90, para cima, para não receber menos que o desejado (75,56 → 75,90; 5,37 → 5,90).
// Tolerância de R$ 0,10 para baixo, para preço redondo não subir quase R$ 1 (80,00 → 79,90).
function arredondarPreco90(valor) {
    const abaixo = Math.floor(valor) - 0.1;
    const escolhido = valor - abaixo <= 0.1 + 1e-9 ? abaixo : abaixo + 1;
    return Math.round(Math.max(escolhido, 0.9) * 100) / 100;
}

// Margem do produto (% sobre o custo). Produto antigo sem margem gravada: deduz a margem do preço base
// (tratado como preço de venda direta), para os preços não mudarem sozinhos.
function margemDoProduto(produto, custoTotal, cfg = configFinanceira) {
    if (produto.margem_pct !== null && produto.margem_pct !== undefined && produto.margem_pct !== '') {
        return { pct: Number(produto.margem_pct), origem: 'produto' };
    }
    if (Number(produto.preco_base) > 0 && custoTotal > 0) {
        const liquido = liquidoDoPrecoCanal(Number(produto.preco_base), 'WhatsApp', cfg);
        // Arredonda para baixo: com o arredondamento para cima do preço, não pode passar do preço antigo
        return { pct: Math.floor(((liquido / custoTotal) - 1) * 1000) / 10, origem: 'preco_antigo' };
    }
    return { pct: Number(cfg.margem_padrao_pct ?? 100), origem: 'padrao' };
}

// Preço por canal para receber o mesmo valor líquido em todos: (alvo + tarifa fixa) ÷ (1 − % descontado)
function precificacaoProduto(produto, cfg = configFinanceira) {
    const custo = custoProducaoProduto(produto, undefined, cfg);
    const margem = margemDoProduto(produto, custo.total, cfg);
    const alvo = custo.total * (1 + margem.pct / 100);
    const fixos = produto.precos_fixos || {};

    const canais = {};
    CANAIS_VENDA.forEach(canal => {
        const bruto = (alvo + taxaDoCanal(canal, cfg).fixa) / (1 - percentualDescontadoCanal(canal, cfg) / 100);
        const sugerido = cfg.arredondar_90 === false ? Math.round(bruto * 100) / 100 : arredondarPreco90(bruto);
        const fixo = Number(fixos[canal]) > 0 ? Number(fixos[canal]) : null;
        const preco = fixo ?? sugerido;
        const recebe = liquidoDoPrecoCanal(preco, canal, cfg);
        canais[canal] = { pct: percentualDescontadoCanal(canal, cfg), sugerido, fixo, preco, recebe, lucro: recebe - custo.total };
    });
    return { custo, margem, alvo, canais };
}

function precoProdutoNoCanal(produto, canal) {
    if (!produto) return 0;
    const p = precificacaoProduto(produto);
    return (p.canais[normalizarCanal(canal)] || p.canais['WhatsApp']).preco;
}

// Crédito parcelado recebido mês a mês (Site/WhatsApp): o dinheiro entra em parcelas, a 1ª um mês
// depois da data do pedido (data da venda no cartão) e as demais nos meses seguintes, no mesmo dia.
function pedidoRecebeMesAMes(p) {
    return CANAIS_PAGAMENTO_PROPRIO.includes(normalizarCanal(p.origem)) &&
        p.forma_pagamento === 'Crédito' && Number(p.parcelas) > 1 && p.recebimento_parcelado === 'mes_a_mes';
}

// [{ numero, total, data: 'AAAA-MM-DD', valor }] — valor líquido (já sem a taxa), a última parcela leva o arredondamento
function parcelasDoPedido(p, filamentos) {
    if (!pedidoRecebeMesAMes(p)) return [];
    const base = String(p.data_pedido || p.created_at || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return [];

    const fin = financeiroDoPedido(p, filamentos);
    const liquido = Math.round((fin.bruto - fin.taxa) * 100) / 100;
    const n = Number(p.parcelas);
    const valorParcela = Math.floor((liquido / n) * 100) / 100;
    const [ano, mes, dia] = base.split('-').map(Number);

    return Array.from({ length: n }, (_, i) => {
        const ultimoDia = new Date(ano, mes + i + 1, 0).getDate(); // último dia do mês da parcela i+1
        const d = new Date(ano, mes + i, Math.min(dia, ultimoDia)); // mes é 1-based: (mes - 1) + (i + 1)
        const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const valor = i === n - 1 ? Math.round((liquido - valorParcela * (n - 1)) * 100) / 100 : valorParcela;
        return { numero: i + 1, total: n, data, valor };
    });
}

// Linhas do painel "Financeiro" do pop-up do pedido
function renderizarResumoFinanceiroPedido(pedido, elementoId = 'resumo-financeiro-pedido') {
    const el = document.getElementById(elementoId);
    if (!el || !pedido) return;

    const f = financeiroDoPedido(pedido);
    const margem = f.bruto > 0 ? (f.lucro / f.bruto) * 100 : 0;
    // O material já foi pago na compra do rolo: o que volta para cobri-lo é retorno do
    // investimento, não lucro. Retorno = lucro + material; lucro é o que sobra além disso.
    const material = f.filamentoItens.reduce((acc, i) => acc + Number(i.custo_total || 0), 0);
    const retorno = f.lucro + material;
    const sobreMaterial = material > 0 ? (f.lucro / material) * 100 : null;

    const linha = (rotulo, valor, extra = '', cor = 'text-red-300') => `
        <div class="flex justify-between gap-2"><span class="text-slate-400">${rotulo}${extra ? ` <span class="text-[10px] text-slate-500">${extra}</span>` : ''}</span><span class="font-mono ${cor}">${valor}</span></div>`;
    const sublinha = (rotulo, valor, extra = '', cor = 'text-slate-300') => `
        <div class="flex justify-between gap-2 pl-3"><span class="text-slate-400">↳ ${rotulo}${extra ? ` <span class="text-[10px] text-slate-500">${extra}</span>` : ''}</span><span class="font-mono ${cor}">${valor}</span></div>`;

    // O título "Financeiro" e a origem dos custos ficam no cabeçalho do painel (pop-up do pedido)
    el.innerHTML = `
        ${linha('Receita bruta (preço de venda)', moedaBR(f.bruto), '', 'text-emerald-300')}
        ${linha('(-) Taxa da plataforma', '- ' + moedaBR(f.taxa), f.taxaReal ? '(real: venda − valor recebido)' : '(estimada)')}
        <div class="flex justify-between gap-2 py-0.5 border-y border-slate-800/80 font-semibold">
            <span class="text-slate-200">${pedidoRecebeMesAMes(pedido)
                ? `(=) Valor a receber em ${pedido.parcelas}x${f.taxaReal ? '' : ' (estimado)'}`
                : (f.taxaReal ? '(=) Valor que caiu na conta' : '(=) Valor a receber (estimado)')}</span>
            <span class="font-mono text-emerald-300">${moedaBR(f.bruto - f.taxa)}</span>
        </div>
        ${f.imposto > 0 ? linha('(-) Imposto', '- ' + moedaBR(f.imposto)) : ''}
        ${linha('(-) Máquina (energia + depreciação)', '- ' + moedaBR(f.maquina), `${f.horas.toFixed(1)} h`)}
        ${f.frete > 0 ? linha('(-) Frete pago', '- ' + moedaBR(f.frete)) : ''}
        <div class="flex justify-between gap-2 pt-1 border-t border-slate-800 font-semibold">
            <span class="text-slate-200">(=) Retorno do pedido</span>
            <span class="font-mono text-emerald-300">${moedaBR(retorno)}</span>
        </div>
        ${f.filamentoItens.map(i => sublinha(`repõe o material: ${escaparHtml(i.nome)}`, moedaBR(i.custo_total), `${Math.round(i.peso_g)}g`)).join('')}
        <div class="flex justify-between gap-2 pl-3 font-bold">
            <span class="text-slate-200">↳ Lucro real</span>
            <span class="font-mono ${f.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}">${moedaBR(f.lucro)}</span>
        </div>
        <div class="text-right text-[10px] text-slate-500">
            ${margem.toFixed(1)}% da venda${sobreMaterial !== null ? ` · ${sobreMaterial.toFixed(0)}% sobre o material` : ''}
        </div>
        <p class="text-[10px] text-slate-500 leading-relaxed pt-1 border-t border-slate-800/80">
            O material foi pago na compra do rolo: a parte que repõe o material é o seu dinheiro voltando, para comprar o próximo. O lucro real é o que sobra além disso.
        </p>
    `;
}

// ==========================================
// MODAL DE CONFIGURAÇÕES
// ==========================================
async function abrirModalConfiguracoes() {
    await carregarConfigFinanceira();
    const t = configFinanceira.taxas_canais;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };

    set('cfg-taxa-shopee-pct', t['Shopee'].pct); set('cfg-taxa-shopee-fixa', t['Shopee'].fixa);
    set('cfg-taxa-ml-pct', t['Mercado Livre'].pct); set('cfg-taxa-ml-fixa', t['Mercado Livre'].fixa);
    set('cfg-taxa-site-pct', t['Site'].pct); set('cfg-taxa-site-fixa', t['Site'].fixa);
    set('cfg-taxa-wts-pct', t['WhatsApp'].pct); set('cfg-taxa-wts-fixa', t['WhatsApp'].fixa);
    set('cfg-potencia', configFinanceira.potencia_media_w);
    set('cfg-tarifa-kwh', configFinanceira.tarifa_kwh);
    set('cfg-depreciacao', configFinanceira.depreciacao_hora);
    set('cfg-imposto-pct', configFinanceira.imposto_pct);
    set('cfg-margem-padrao', configFinanceira.margem_padrao_pct ?? 100);
    document.getElementById('cfg-arredondar-90').checked = configFinanceira.arredondar_90 !== false;

    const pag = configFinanceira.taxas_pagamento;
    set('cfg-pag-pix', pag['Pix']);
    set('cfg-pag-debito', pag['Débito']);
    document.getElementById('cfg-taxas-credito').innerHTML = Array.from({ length: MAX_PARCELAS }, (_, i) => `
        <div>
            <label class="block text-[10px] text-slate-500 text-center">${i + 1}x</label>
            <input type="number" step="0.01" min="0" max="100" id="cfg-pag-credito-${i + 1}" value="${Number(pag['Crédito'][i + 1]) || 0}" class="w-full bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs text-slate-100 text-center focus:outline-none focus:border-indigo-500">
        </div>`).join('');
    set('cfg-recebimento-padrao', pag.recebimento_padrao || 'na_hora');
    document.getElementById('cfg-juros-cliente').checked = !!pag.juros_cliente_padrao;
    atualizarPreviaCustoHora();

    document.getElementById('modal-configuracoes')?.classList.remove('hidden');
}

function fecharModalConfiguracoes() {
    document.getElementById('modal-configuracoes')?.classList.add('hidden');
}

function lerFormularioConfiguracoes() {
    const num = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    return {
        taxas_canais: {
            'Shopee': { pct: num('cfg-taxa-shopee-pct'), fixa: num('cfg-taxa-shopee-fixa') },
            'Mercado Livre': { pct: num('cfg-taxa-ml-pct'), fixa: num('cfg-taxa-ml-fixa') },
            'Site': { pct: num('cfg-taxa-site-pct'), fixa: num('cfg-taxa-site-fixa') },
            'WhatsApp': { pct: num('cfg-taxa-wts-pct'), fixa: num('cfg-taxa-wts-fixa') }
        },
        potencia_media_w: num('cfg-potencia'),
        tarifa_kwh: num('cfg-tarifa-kwh'),
        depreciacao_hora: num('cfg-depreciacao'),
        imposto_pct: num('cfg-imposto-pct'),
        margem_padrao_pct: num('cfg-margem-padrao'),
        arredondar_90: !!document.getElementById('cfg-arredondar-90')?.checked,
        taxas_pagamento: {
            'Pix': num('cfg-pag-pix'),
            'Dinheiro': 0,
            'Débito': num('cfg-pag-debito'),
            'Crédito': Object.fromEntries(Array.from({ length: MAX_PARCELAS }, (_, i) => [i + 1, num(`cfg-pag-credito-${i + 1}`)])),
            recebimento_padrao: document.getElementById('cfg-recebimento-padrao')?.value || 'na_hora',
            juros_cliente_padrao: !!document.getElementById('cfg-juros-cliente')?.checked
        }
    };
}

function atualizarPreviaCustoHora() {
    const el = document.getElementById('previa-custo-hora');
    if (!el) return;
    const cfg = lerFormularioConfiguracoes();
    const energia = cfg.potencia_media_w / 1000 * cfg.tarifa_kwh;
    el.innerHTML = `
        <div class="flex justify-between text-slate-400"><span>Energia (${cfg.potencia_media_w} W × ${moedaBR(cfg.tarifa_kwh)}/kWh)</span><span>${moedaBR(energia)}/h</span></div>
        <div class="flex justify-between text-slate-400"><span>Depreciação</span><span>${moedaBR(cfg.depreciacao_hora)}/h</span></div>
        <div class="flex justify-between font-bold border-t border-slate-800 pt-1 mt-1"><span class="text-slate-200">Custo por hora</span><span class="text-amber-300">${moedaBR(custoHoraImpressao(cfg))}/h</span></div>
    `;
}

async function salvarConfiguracoes(e) {
    if (e) e.preventDefault();
    const novaConfig = lerFormularioConfiguracoes();

    try {
        const client = obterSupabaseClient();
        if (!client) throw new Error('Cliente Supabase não inicializado.');

        const { error } = await client
            .from('config_financeira')
            .update({ ...novaConfig, updated_at: new Date().toISOString() })
            .eq('id', 1);
        if (error) throw error;

        configFinanceira = { ...configFinanceira, ...novaConfig };
        fecharModalConfiguracoes();

        await recalcularPedidosEmAndamento(client);

        // Preços do catálogo (lista e, se aberto, o cadastro do produto) e o Resumo usam os parâmetros novos
        if (typeof aplicarFiltrosEExibir === 'function') aplicarFiltrosEExibir();
        if (typeof atualizarPrecificacaoModal === 'function') atualizarPrecificacaoModal();
        if (typeof carregarPedidos === 'function') await carregarPedidos();
        await carregarDadosFinanceiros();
    } catch (err) {
        alert('Erro ao salvar parâmetros: ' + err.message);
    }
}

// Pedidos ainda não pagos passam a usar os parâmetros novos (taxa do canal + forma de pagamento, imposto,
// custo de máquina). Pedidos em "Pagamento Recebido" ficam como estão: são o histórico.
async function recalcularPedidosEmAndamento(client) {
    const { data: pedidos, error } = await client.from('pedidos').select('*').neq('status', 'Pagamento Recebido');
    if (error) throw error;

    const mudancas = (pedidos || []).map(p => {
        const novos = calcularValoresFinanceirosPedido({
            origem: p.origem,
            valorUnitario: p.valor_total,
            quantidade: p.quantidade_unidades,
            tempoImpressao: p.tempo_impressao,
            formaPagamento: p.forma_pagamento,
            parcelas: p.parcelas,
            jurosCliente: p.juros_cliente
        });
        const mudou = ['taxa_estimada', 'imposto_estimado', 'custo_maquina'].some(k => Number(p[k]) !== novos[k]);
        return mudou ? client.from('pedidos').update(novos).eq('id', p.id) : null;
    }).filter(Boolean);

    const resultados = await Promise.all(mudancas);
    const falha = resultados.find(r => r.error);
    if (falha) throw falha.error;
}

// ==========================================
// INICIALIZAÇÃO E VISÃO
// ==========================================
async function inicializarModuloFinancas() {
    mesSelecionadoFinancas();
    await carregarConfigFinanceira();
    await carregarDadosFinanceiros();
}

function alternarVisaoFinanceira(visao) {
    visaoFinanceiraAtual = visao;

    const btnComp = document.getElementById('btn-visao-competencia');
    const btnCaixa = document.getElementById('btn-visao-caixa');

    if (visao === 'competencia') {
        if (btnComp) btnComp.className = 'px-3 py-1.5 rounded-lg transition bg-indigo-600 text-white shadow';
        if (btnCaixa) btnCaixa.className = 'px-3 py-1.5 rounded-lg transition text-slate-400 hover:text-white';
    } else {
        if (btnCaixa) btnCaixa.className = 'px-3 py-1.5 rounded-lg transition bg-emerald-600 text-white shadow';
        if (btnComp) btnComp.className = 'px-3 py-1.5 rounded-lg transition text-slate-400 hover:text-white';
    }

    carregarDadosFinanceiros();
}

// ==========================================
// CÁLCULOS DRE, CARDS E GRÁFICOS
// ==========================================
async function carregarDadosFinanceiros() {
    const anoMes = mesSelecionadoFinancas();
    const [anoSel, mesSel] = anoMes.split('-');
    const noMesSelecionado = (dataValor) => {
        const info = extrairAnoMes(dataValor);
        return info && info.ano === anoSel && info.mes === mesSel;
    };

    try {
        const client = obterSupabaseClient();
        if (!client) return;

        await carregarConfigFinanceira();
        if (typeof carregarImpressoras === 'function' && (typeof listaImpressorasGlobal === 'undefined' || listaImpressorasGlobal.length === 0)) {
            await carregarImpressoras();
        }

        const [
            { data: pedidos, error: errPedidos },
            { data: filamentos, error: errFilamentos },
            { data: comprasFilamento, error: errCompras },
            despesasMes
        ] = await Promise.all([
            client.from('pedidos').select('*'),
            client.from('filamentos').select('*'),
            client.from('filamento_compras').select('*').order('data_compra', { ascending: true }),
            carregarDespesasDoMes(anoMes)
        ]);

        if (errPedidos) throw errPedidos;
        if (errFilamentos) console.warn('Aviso estoque filamentos:', errFilamentos.message);
        if (errCompras) console.warn('Aviso compras de filamento:', errCompras.message);

        const todosPedidos = pedidos || [];
        const listaFilamentos = filamentos || [];
        const mapaFilamentoPorId = {};
        listaFilamentos.forEach(f => { if (f && f.id) mapaFilamentoPorId[f.id] = f; });
        const nomeDoFilamento = (f) => `${f.material || ''} ${f.cor || ''}`.trim() || 'Filamento';


        // Compras de filamento do mês (investimento em estoque)
        let totalInvestimentoEstoqueMes = 0;
        let pesoCompradoMes = 0;
        const listaCarreteisCompradosMes = [];
        (comprasFilamento || []).forEach(c => {
            if (!noMesSelecionado(c.data_compra)) return;
            const valor = Number(c.valor_pago || 0) || 0;
            const peso = Number(c.peso_g || 0) || 0;
            const filamento = mapaFilamentoPorId[c.filamento_id];
            totalInvestimentoEstoqueMes += valor;
            pesoCompradoMes += peso;
            listaCarreteisCompradosMes.push({
                nome: `${filamento ? nomeDoFilamento(filamento) : 'Filamento excluído'} · ${Math.round(peso)}g${c.marca ? ` · ${c.marca}` : ''}`,
                preco: valor
            });
        });

        // Pedidos do mês: competência = data do pedido; caixa = data do recebimento
        const pedidosFiltrados = todosPedidos.filter(p => {
            if (!p) return false;
            if (visaoFinanceiraAtual === 'competencia') return noMesSelecionado(p.data_pedido || p.created_at);
            if (p.status_pagamento !== 'Pago' && p.status !== 'Pagamento Recebido') return false;
            return noMesSelecionado(p.data_pagamento || p.data_pedido || p.created_at);
        });

        // Somatórios das vendas
        const tot = { bruto: 0, liberado: 0, taxa: 0, taxaReal: 0, qtdReal: 0, imposto: 0, filamento: 0, maquina: 0, horas: 0, frete: 0 };
        const contagemProdutos = {};
        const contagemCanais = { 'Shopee': 0, 'Mercado Livre': 0, 'Site': 0, 'WhatsApp': 0 };
        const taxasPorCanal = { 'Shopee': 0, 'Mercado Livre': 0, 'Site': 0, 'WhatsApp': 0 };
        const consumoFilamentos = {};

        pedidosFiltrados.forEach(p => {
            const fin = financeiroDoPedido(p, listaFilamentos);
            const canal = normalizarCanal(p.origem);
            const qtd = parseInt(p.quantidade_unidades || p.quantidade || 1, 10) || 1;

            tot.bruto += fin.bruto;
            tot.taxa += fin.taxa;
            if (fin.taxaReal) { tot.taxaReal += fin.taxa; tot.qtdReal += 1; }
            tot.imposto += fin.imposto;
            tot.filamento += fin.filamento;
            tot.maquina += fin.maquina;
            tot.horas += fin.horas;
            tot.frete += fin.frete;

            if (p.status_pagamento === 'Pago' || p.status === 'Pagamento Recebido') {
                tot.liberado += fin.bruto - fin.taxa;
            }

            contagemCanais[canal] = (contagemCanais[canal] || 0) + fin.bruto;
            taxasPorCanal[canal] = (taxasPorCanal[canal] || 0) + fin.taxa;

            fin.filamentoItens.forEach(item => {
                const filamentoAtual = item.filamento_id ? mapaFilamentoPorId[item.filamento_id] : null;
                const nome = filamentoAtual ? nomeDoFilamento(filamentoAtual) : item.nome;
                if (!consumoFilamentos[nome]) consumoFilamentos[nome] = { peso: 0, custoTotal: 0 };
                consumoFilamentos[nome].peso += item.peso_g;
                consumoFilamentos[nome].custoTotal += item.custo_total;
            });

            const nomeProd = (p.produto && String(p.produto).trim()) ? String(p.produto).trim() : 'Produto Indefinido';
            if (!contagemProdutos[nomeProd]) contagemProdutos[nomeProd] = { qtd: 0, faturamento: 0 };
            contagemProdutos[nomeProd].qtd += qtd;
            contagemProdutos[nomeProd].faturamento += fin.bruto;
        });

        const agruparPorCategoria = (lista) => {
            const grupos = {};
            CATEGORIAS_DESPESA.forEach(c => { grupos[c] = []; });
            lista.forEach(d => grupos[CATEGORIAS_DESPESA.includes(d.categoria) ? d.categoria : 'Outros'].push(d));
            return grupos;
        };
        const somar = (lista) => lista.reduce((acc, d) => acc + Number(d.valor || 0), 0);
        const setTexto = (id, texto) => { const el = document.getElementById(id); if (el) el.textContent = texto; };
        const pintarResultado = (id, valor) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = moedaBR(valor);
            el.className = `text-lg md:text-xl font-black ${valor >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
        };

        // Accordions laterais (sempre pelo mês das despesas/compras)
        const despesasMesPorCategoria = agruparPorCategoria(despesasMes);
        const totalManutencaoMes = somar(despesasMesPorCategoria['Manutenção & Peças']);
        setTexto('resumo-investimento-estoque', moedaBR(totalInvestimentoEstoqueMes));
        setTexto('resumo-manutencao-pecas', moedaBR(totalManutencaoMes));
        renderizarAccordionsLaterais(listaCarreteisCompradosMes, despesasMesPorCategoria['Manutenção & Peças']);

        const despesasGerais = despesasMes.filter(d => d.categoria !== CATEGORIA_INVESTIMENTO && d.categoria !== 'Manutenção & Peças');
        renderizarPainelOrigens({
            filamento: totalInvestimentoEstoqueMes,
            qtdComprasFilamento: listaCarreteisCompradosMes.length,
            manutencao: totalManutencaoMes,
            equipamentos: somar(despesasMesPorCategoria[CATEGORIA_INVESTIMENTO]),
            despesas: somar(despesasGerais),
            pendentes: somar(despesasGerais.filter(d => !d.pago)),
            qtdPendentes: despesasGerais.filter(d => !d.pago && Number(d.valor) > 0).length
        });

        if (visaoFinanceiraAtual === 'caixa') {
            await renderizarVisaoCaixa({
                client, anoMes, todosPedidos, pedidosRecebidos: pedidosFiltrados, listaFilamentos,
                tot, totalInvestimentoEstoqueMes, listaCarreteisCompradosMes, agruparPorCategoria, somar, setTexto, pintarResultado
            });
        } else {
            // VISÃO DE VENDAS: equipamentos são investimento (bem da empresa), não gasto do mês
            const despesasDoResultado = despesasMes.filter(d => d.categoria !== CATEGORIA_INVESTIMENTO);
            const totalEquipamentos = somar(despesasMesPorCategoria[CATEGORIA_INVESTIMENTO]);
            const totalDespesas = somar(despesasDoResultado);
            const deducoesVendas = tot.taxa + tot.imposto + tot.filamento + tot.maquina + tot.frete;
            const lucroLiquido = tot.bruto - deducoesVendas - totalDespesas;
            const margemLiquida = tot.bruto > 0 ? (lucroLiquido / tot.bruto) * 100 : 0;
            const totalInvestimentos = totalInvestimentoEstoqueMes + totalEquipamentos;

            setTexto('label-faturamento', 'Faturamento Bruto');
            setTexto('card-faturamento', moedaBR(tot.bruto));
            setTexto('sub-faturamento', 'Total de pedidos no mês');
            setTexto('label-liberado', 'Dinheiro Liberado');
            setTexto('card-liberado', moedaBR(tot.liberado));
            setTexto('sub-liberado', 'Recebido, já sem as taxas');
            setTexto('label-investimento', '📦 Investimentos');
            setTexto('card-investimento-estoque', moedaBR(totalInvestimentos));
            setTexto('sub-investimento-estoque', `Filamento ${moedaBR(totalInvestimentoEstoqueMes)} · Equip. ${moedaBR(totalEquipamentos)}`);
            setTexto('label-manutencao', '🛠️ Manut. & Peças');
            setTexto('card-manutencao-gastos', moedaBR(totalManutencaoMes));
            setTexto('sub-manutencao', 'Troca bico/óleo/peças');
            setTexto('label-lucro', 'Lucro Líquido Real');
            pintarResultado('card-lucro', lucroLiquido);
            setTexto('sub-lucro', 'Após taxas e custos');
            setTexto('label-margem', 'Margem Líquida');
            setTexto('card-margem', `${margemLiquida.toFixed(1)}%`);
            setTexto('sub-margem', 'Rentabilidade sobre receita');

            const despesasPorCategoria = agruparPorCategoria(despesasDoResultado);
            renderizarDRE({
                tot, contagemCanais, taxasPorCanal, consumoFilamentos, despesasPorCategoria,
                somaCategoria: (cat) => somar(despesasPorCategoria[cat]),
                lucroLiquido, margemLiquida
            });
        }

        renderizarRankings(contagemProdutos, consumoFilamentos);
        renderizarGraficos(todosPedidos, contagemCanais, anoSel);

    } catch (err) {
        console.error('Erro ao carregar dados financeiros:', err.message || err);
    }
}

// ---------- Peças de layout compartilhadas pelo DRE e pelo Fluxo de Caixa ----------
function linhaDetalheFin(texto, valor, cor = 'border-red-500/30', corValor = 'text-red-300', sinal = '- ') {
    return `
        <div class="flex justify-between items-center py-0.5 border-l-2 ${cor} pl-2">
            <span class="truncate pr-2">• ${texto}</span>
            <span class="font-mono ${corValor} shrink-0">${sinal}${moedaBR(valor)}</span>
        </div>`;
}

function linhaVaziaFin(texto) {
    return `<div class="italic text-slate-500 py-0.5">• ${texto}</div>`;
}

function renderizarLinhasFin(linhas) {
    const el = document.getElementById('dre-linhas');
    if (!el) return;
    el.innerHTML = linhas.filter(l => !(l.ocultarSeZero && l.valor === 0)).map(l => `
        <div class="space-y-1">
            <div class="flex justify-between items-center py-1.5 border-b border-slate-800/80 font-bold ${l.positivo ? 'text-slate-200' : 'text-slate-300'}">
                <span>${l.titulo}${l.nota ? ` <span class="text-[10px] font-normal text-slate-500">(${l.nota})</span>` : ''}</span>
                <span class="font-mono ${l.positivo ? 'text-emerald-400' : 'text-red-400'}">${l.positivo ? '' : '- '}${moedaBR(l.valor)}</span>
            </div>
            <div class="pl-3 space-y-1 text-[11px] text-slate-400">${l.detalhes}</div>
        </div>
    `).join('');
}

function definirCabecalhoResultado(titulo, rotulo, valor, complemento, nota) {
    const elTitulo = document.getElementById('titulo-dre');
    if (elTitulo) elTitulo.innerHTML = titulo;
    const elRotulo = document.getElementById('dre-rotulo-resultado');
    if (elRotulo) elRotulo.textContent = rotulo;
    const elValor = document.getElementById('dre-lucro-liquido');
    if (elValor) {
        elValor.textContent = moedaBR(valor);
        elValor.className = `font-mono font-black text-sm ${valor >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
    }
    const elComplemento = document.getElementById('dre-margem-porcentagem');
    if (elComplemento) elComplemento.textContent = complemento;
    const elNota = document.getElementById('dre-nota-rodape');
    if (elNota) elNota.innerHTML = nota;
}

// ---------- VISÃO DE VENDAS (COMPETÊNCIA): "estou lucrando?" ----------
function renderizarDRE(dados) {
    const { tot, contagemCanais, taxasPorCanal, consumoFilamentos, despesasPorCategoria, somaCategoria } = dados;
    const detalhe = linhaDetalheFin;
    const vazio = linhaVaziaFin;
    // vazioSeNada = false quando a linha já tem outros detalhes (ex: frete/imposto vindos dos pedidos)
    const detalhesDespesas = (cat, vazioSeNada = true) => despesasPorCategoria[cat].length
        ? despesasPorCategoria[cat].map(d => detalhe(`${escaparHtml(d.descricao)}${d.pago ? '' : ' <span class="text-amber-400">(pendente)</span>'}`, d.valor)).join('')
        : (vazioSeNada ? vazio('Nenhum lançamento neste mês') : '');

    renderizarLinhasFin([
        {
            titulo: '(+) Receita Bruta de Vendas', valor: tot.bruto, positivo: true,
            detalhes: Object.entries(contagemCanais).filter(([, v]) => v > 0).map(([canal, v]) => detalhe(canal, v, 'border-emerald-500/30', 'text-emerald-300', '+ ')).join('') || vazio('Nenhuma venda no período')
        },
        {
            titulo: '(-) Taxas de Plataformas / Comissões', valor: tot.taxa,
            nota: tot.qtdReal > 0 ? `${tot.qtdReal} pedido(s) com valor real recebido` : 'estimadas pela configuração',
            detalhes: Object.entries(taxasPorCanal).filter(([, v]) => v > 0).map(([canal, v]) => detalhe(canal, v)).join('') || vazio('Sem taxas no período')
        },
        {
            titulo: '(-) Impostos', valor: tot.imposto + somaCategoria('Impostos'),
            detalhes: (tot.imposto > 0 ? detalhe('Imposto sobre as vendas', tot.imposto) : '') + detalhesDespesas('Impostos', tot.imposto === 0)
        },
        {
            titulo: '(-) Filamento Consumido nas Vendas (CPV)', valor: tot.filamento,
            detalhes: Object.entries(consumoFilamentos).filter(([, i]) => i.peso > 0).map(([nome, i]) => detalhe(`${escaparHtml(nome)} (${i.peso.toFixed(0)}g)`, i.custoTotal)).join('') || vazio('Nenhum consumo de filamento')
        },
        {
            titulo: '(-) Custo de Máquina (energia + depreciação)', valor: tot.maquina,
            detalhes: tot.horas > 0 ? detalhe(`${tot.horas.toFixed(1)} h de impressão`, tot.maquina) : vazio('Sem horas de impressão registradas')
        },
        {
            titulo: '(-) Frete', valor: tot.frete + somaCategoria('Frete'), ocultarSeZero: true,
            detalhes: (tot.frete > 0 ? detalhe('Frete pago nos pedidos', tot.frete) : '') + detalhesDespesas('Frete', tot.frete === 0)
        },
        { titulo: '(-) Consumíveis e Insumos Extras', valor: somaCategoria('Consumíveis'), detalhes: detalhesDespesas('Consumíveis') },
        { titulo: '(-) Ferramentas', valor: somaCategoria('Ferramentas'), ocultarSeZero: true, detalhes: detalhesDespesas('Ferramentas') },
        { titulo: '(-) Manutenção & Peças', valor: somaCategoria('Manutenção & Peças'), detalhes: detalhesDespesas('Manutenção & Peças') },
        { titulo: '(-) Custos Fixos', valor: somaCategoria('Custo fixo'), detalhes: detalhesDespesas('Custo fixo') },
        { titulo: '(-) Marketing', valor: somaCategoria('Marketing'), ocultarSeZero: true, detalhes: detalhesDespesas('Marketing') },
        { titulo: '(-) Outras Despesas', valor: somaCategoria('Outros'), ocultarSeZero: true, detalhes: detalhesDespesas('Outros') }
    ]);

    definirCabecalhoResultado(
        '<span>📋</span> Demonstrativo do Resultado (DRE)',
        '(=) LUCRO LÍQUIDO REAL',
        dados.lucroLiquido,
        `(${dados.margemLiquida.toFixed(1)}%)`,
        'Mostra se o mês deu lucro. Compras de filamento e de equipamentos não entram como gasto: viram bens da empresa (card "Investimentos"). O filamento vira custo quando é usado num pedido, e o desgaste das máquinas entra pela depreciação por hora.'
    );
}

// ---------- VISÃO DE CAIXA: "quanto dinheiro entrou e saiu da conta?" ----------
async function renderizarVisaoCaixa(ctx) {
    const { client, anoMes, todosPedidos, pedidosRecebidos, listaFilamentos, tot, totalInvestimentoEstoqueMes,
            listaCarreteisCompradosMes, agruparPorCategoria, somar, setTexto, pintarResultado } = ctx;
    const fimMes = ultimoDiaDoMes(anoMes);

    // Despesas pagas no mês (pela data do pagamento) e todas as pendentes até o fim do mês
    const [{ data: pagasNoMes, error: errPagas }, { data: pendentes, error: errPendentes }] = await Promise.all([
        client.from('despesas').select('*').eq('pago', true).gte('data_pagamento', `${anoMes}-01`).lte('data_pagamento', fimMes),
        client.from('despesas').select('*').eq('pago', false).lte('data', fimMes)
    ]);
    if (errPagas) throw errPagas;
    if (errPendentes) throw errPendentes;

    const pagasPorCategoria = agruparPorCategoria((pagasNoMes || []).filter(d => Number(d.valor) > 0));
    const totalDespesasPagas = somar(pagasNoMes || []);

    // Entradas: o que caiu na conta (valor real informado ou estimativa sem a taxa).
    // Crédito mês a mês não entra de uma vez: entra cada parcela no mês da sua data, independente da etapa.
    const parcelasPorPedido = todosPedidos
        .filter(pedidoRecebeMesAMes)
        .map(p => ({ pedido: p, parcelas: parcelasDoPedido(p, listaFilamentos) }));
    const entradasParcelas = parcelasPorPedido.flatMap(({ pedido, parcelas }) => parcelas
        .filter(pc => pc.data.slice(0, 7) === anoMes)
        .map(pc => ({ pedido, valor: pc.valor, real: false, parcela: pc })));
    const entradas = [
        ...pedidosRecebidos.filter(p => !pedidoRecebeMesAMes(p)).map(p => {
            const fin = financeiroDoPedido(p, listaFilamentos);
            return { pedido: p, valor: fin.bruto - fin.taxa, real: fin.taxaReal };
        }),
        ...entradasParcelas
    ];
    const totalEntradas = entradas.reduce((acc, e) => acc + e.valor, 0);

    // Pendências: pedidos ainda não pagos (estimativa já sem a taxa), parcelas dos meses seguintes e despesas pendentes
    const aReceberPedidos = todosPedidos
        .filter(p => !pedidoRecebeMesAMes(p) && p.status !== 'Pagamento Recebido' && p.status_pagamento !== 'Pago')
        .reduce((acc, p) => { const fin = financeiroDoPedido(p, listaFilamentos); return acc + (fin.bruto - fin.taxa); }, 0);
    const parcelasFuturas = parcelasPorPedido.flatMap(({ parcelas }) => parcelas.filter(pc => pc.data > fimMes));
    const aReceber = aReceberPedidos + parcelasFuturas.reduce((acc, pc) => acc + pc.valor, 0);
    const listaPendentes = (pendentes || []).filter(d => Number(d.valor) > 0);
    const aPagar = somar(listaPendentes);

    const totalSaidas = totalInvestimentoEstoqueMes + totalDespesasPagas + tot.frete;
    const saldo = totalEntradas - totalSaidas;

    // Cards
    setTexto('label-faturamento', 'Entradas no Mês');
    setTexto('card-faturamento', moedaBR(totalEntradas));
    setTexto('sub-faturamento', `${entradas.length - entradasParcelas.length} pedido(s)${entradasParcelas.length ? ` + ${entradasParcelas.length} parcela(s)` : ''}`);
    setTexto('label-liberado', 'A Receber');
    setTexto('card-liberado', moedaBR(aReceber));
    setTexto('sub-liberado', parcelasFuturas.length
        ? `Pedidos não pagos + ${parcelasFuturas.length} parcela(s) futura(s)`
        : 'Pedidos ainda não pagos (estimado)');
    setTexto('label-investimento', '📦 Investimentos Pagos');
    setTexto('card-investimento-estoque', moedaBR(totalInvestimentoEstoqueMes + somar(pagasPorCategoria[CATEGORIA_INVESTIMENTO])));
    setTexto('sub-investimento-estoque', `Filamento ${moedaBR(totalInvestimentoEstoqueMes)} · Equip. ${moedaBR(somar(pagasPorCategoria[CATEGORIA_INVESTIMENTO]))}`);
    setTexto('label-manutencao', '🛠️ Manut. Paga');
    setTexto('card-manutencao-gastos', moedaBR(somar(pagasPorCategoria['Manutenção & Peças'])));
    setTexto('sub-manutencao', 'Pago neste mês');
    setTexto('label-lucro', 'Saldo do Mês');
    pintarResultado('card-lucro', saldo);
    setTexto('sub-lucro', 'Entradas − saídas');
    setTexto('label-margem', 'A Pagar');
    setTexto('card-margem', moedaBR(aPagar));
    setTexto('sub-margem', `${listaPendentes.length} despesa(s) pendente(s)`);

    // Linhas do fluxo
    const detalhe = linhaDetalheFin;
    const vazio = linhaVaziaFin;
    const dataCurta = (d) => d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}` : '';
    const linhasDespesasPagas = CATEGORIAS_DESPESA
        .filter(cat => pagasPorCategoria[cat].length > 0)
        .map(cat => ({
            titulo: `(-) ${cat}`,
            valor: somar(pagasPorCategoria[cat]),
            detalhes: pagasPorCategoria[cat].map(d => detalhe(`${escaparHtml(d.descricao)} <span class="text-slate-500">pago ${dataCurta(d.data_pagamento)}</span>`, d.valor)).join('')
        }));

    renderizarLinhasFin([
        {
            titulo: '(+) Entradas — pedidos recebidos', valor: totalEntradas, positivo: true,
            nota: entradasParcelas.length ? 'inclui parcelas de crédito mês a mês' : 'valor que caiu na conta',
            detalhes: entradas.length
                ? entradas.map(e => detalhe(
                    e.parcela
                        ? `${escaparHtml(e.pedido.cliente || 'Pedido')} · ${normalizarCanal(e.pedido.origem)} · parcela ${e.parcela.numero}/${e.parcela.total} <span class="text-slate-500">${dataCurta(e.parcela.data)} (estimado)</span>`
                        : `${escaparHtml(e.pedido.cliente || 'Pedido')} · ${normalizarCanal(e.pedido.origem)} <span class="text-slate-500">${dataCurta(String(e.pedido.data_pagamento || '').slice(0, 10))}${e.real ? '' : ' (estimado)'}</span>`,
                    e.valor, 'border-emerald-500/30', 'text-emerald-300', '+ ')).join('')
                : vazio('Nenhum pedido recebido neste mês')
        },
        {
            titulo: '(-) Compras de Filamento', valor: totalInvestimentoEstoqueMes,
            detalhes: listaCarreteisCompradosMes.length
                ? listaCarreteisCompradosMes.map(c => detalhe(escaparHtml(c.nome), c.preco)).join('')
                : vazio('Nenhuma compra de filamento neste mês')
        },
        ...linhasDespesasPagas,
        {
            titulo: '(-) Frete pago nos pedidos', valor: tot.frete, ocultarSeZero: true,
            detalhes: detalhe('Frete dos pedidos recebidos no mês', tot.frete)
        },
        ...(linhasDespesasPagas.length === 0 ? [{ titulo: '(-) Despesas pagas', valor: 0, detalhes: vazio('Nenhuma despesa paga neste mês') }] : [])
    ]);

    definirCabecalhoResultado(
        '<span>💵</span> Fluxo de Caixa do Mês',
        '(=) SALDO DO MÊS',
        saldo,
        `(entradas ${moedaBR(totalEntradas)} − saídas ${moedaBR(totalSaidas)})`,
        'Mostra só o dinheiro que realmente entrou ou saiu da conta neste mês: pedidos pela data do recebimento, despesas pela data do pagamento e filamento pela data da compra. Custo de máquina e filamento consumido não aparecem aqui porque não são saída de dinheiro. O que ainda vai entrar ou sair está nos cards "A Receber" e "A Pagar".'
    );
}

// ---------- Painel "De onde vêm os números": cada valor com link para a aba onde é lançado ----------
function renderizarPainelOrigens(o) {
    const el = document.getElementById('painel-origens');
    if (!el) return;

    const linha = (icone, titulo, valor, sub, aba, cor) => `
        <button onclick="trocarAba('${aba}'); ${aba === 'estoque' ? 'carregarFilamentos();' : aba === 'manutencao' ? 'inicializarModuloManutencao();' : 'inicializarModuloDespesas();'}"
            class="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-600 transition text-left group">
            <div class="min-w-0">
                <div class="text-xs font-semibold text-slate-200">${icone} ${titulo}</div>
                <div class="text-[10px] text-slate-500">${sub}</div>
            </div>
            <div class="text-right shrink-0">
                <div class="font-mono font-bold text-xs ${cor}">${moedaBR(valor)}</div>
                <div class="text-[10px] text-indigo-400 group-hover:text-indigo-300">ver →</div>
            </div>
        </button>`;

    el.innerHTML = [
        linha('🧵', 'Compras de filamento', o.filamento, `${o.qtdComprasFilamento} compra(s) · Estoque Filamentos`, 'estoque', 'text-purple-300'),
        linha('🛠️', 'Manutenção & peças', o.manutencao, 'Manut. Impressoras', 'manutencao', 'text-amber-300'),
        linha('📦', 'Equipamentos / investimentos', o.equipamentos, 'Despesas & Investimentos', 'despesas', 'text-purple-300'),
        linha('💸', 'Despesas gerais', o.despesas, o.qtdPendentes ? `${o.qtdPendentes} pendente(s): ${moedaBR(o.pendentes)} · Despesas & Investimentos` : 'Tudo pago no mês · Despesas & Investimentos', 'despesas', 'text-rose-300')
    ].join('');
}

// ---------- Accordions laterais: compras de filamento e manutenção do mês ----------
function renderizarAccordionsLaterais(compras, gastosManutencao) {
    const elCompras = document.getElementById('lista-detalhe-carreteis-mes');
    if (elCompras) {
        elCompras.innerHTML = compras.length === 0
            ? `<p class="text-slate-500 italic text-[11px] text-center py-2">• Nenhuma compra de filamento neste mês.</p>`
            : compras.map(c => `
                <div class="flex justify-between items-center py-1 border-b border-slate-800/60 text-xs">
                    <span class="font-bold text-slate-200 truncate pr-2">• ${escaparHtml(c.nome)}</span>
                    <span class="font-mono font-bold text-purple-300 shrink-0">${moedaBR(c.preco)}</span>
                </div>`).join('');
    }

    const elManut = document.getElementById('lista-detalhe-manutencao-mes');
    if (elManut) {
        elManut.innerHTML = gastosManutencao.length === 0
            ? `<p class="text-slate-500 italic text-[11px] text-center py-2">• Nenhum gasto de manutenção neste mês.</p>`
            : gastosManutencao.map(d => `
                <div class="flex justify-between items-center py-1 border-b border-slate-800/60 text-xs">
                    <span class="font-bold text-slate-200 truncate pr-2">• ${escaparHtml(d.descricao)}</span>
                    <span class="font-mono font-bold text-amber-300 shrink-0">${moedaBR(d.valor)}</span>
                </div>`).join('');
    }
}

function renderizarRankings(contagemProdutos, consumoFilamentos) {
    const elTop = document.getElementById('ranking-top-produtos');
    const elFilamentos = document.getElementById('ranking-filamentos-consumo');

    const listaProds = Object.entries(contagemProdutos || {}).map(([nome, d]) => ({ nome, ...d }));
    listaProds.sort((a, b) => b.qtd - a.qtd);

    if (elTop) {
        if (listaProds.length === 0) {
            elTop.innerHTML = `<p class="text-slate-500 italic text-center py-4">Nenhuma venda registrada no período.</p>`;
        } else {
            elTop.innerHTML = listaProds.slice(0, 5).map((p, i) => `
                <div class="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-slate-800/60">
                    <div class="flex items-center gap-2.5 truncate">
                        <span class="w-5 h-5 rounded-full ${i === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-slate-800 text-slate-400'} flex items-center justify-center font-bold text-[10px] shrink-0">${i + 1}</span>
                        <span class="font-bold text-slate-200 truncate">${p.nome}</span>
                    </div>
                    <div class="text-right shrink-0">
                        <span class="font-mono font-bold text-indigo-400">${p.qtd} un</span>
                        <span class="text-[10px] text-slate-500 block font-mono">${p.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                </div>
            `).join('');
        }
    }

    const listaFil = Object.entries(consumoFilamentos || {}).map(([nome, item]) => ({ nome, peso: item.peso }));
    listaFil.sort((a, b) => b.peso - a.peso);

    if (elFilamentos) {
        if (listaFil.length === 0) {
            elFilamentos.innerHTML = `<p class="text-slate-500 italic text-center py-4">Nenhum consumo registrado.</p>`;
        } else {
            elFilamentos.innerHTML = listaFil.slice(0, 5).map(f => `
                <div class="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-slate-800/60">
                    <span class="font-bold text-slate-300 truncate">🧵 ${f.nome}</span>
                    <span class="font-mono font-bold text-emerald-400">${f.peso.toFixed(0)}g</span>
                </div>
            `).join('');
        }
    }
}

function renderizarGraficos(todosPedidos, contagemCanais, anoSel) {
    if (typeof Chart === 'undefined') return;

    const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const faturamentoPorMes = new Array(12).fill(0);

    (todosPedidos || []).forEach(p => {
        if (!p) return;
        // Caixa + crédito mês a mês: cada parcela no mês em que cai (inclusive meses futuros)
        if (visaoFinanceiraAtual === 'caixa' && pedidoRecebeMesAMes(p)) {
            const qtdP = parseInt(p.quantidade_unidades || p.quantidade || 1, 10) || 1;
            const brutoParcela = (Number(p.valor_total || 0) * qtdP) / Number(p.parcelas);
            parcelasDoPedido(p).forEach(pc => {
                if (pc.data.slice(0, 4) === String(anoSel)) faturamentoPorMes[parseInt(pc.data.slice(5, 7), 10) - 1] += brutoParcela;
            });
            return;
        }
        // Vendas: mês do pedido. Caixa: só pedidos recebidos, no mês do recebimento
        const recebido = p.status === 'Pagamento Recebido' || p.status_pagamento === 'Pago';
        if (visaoFinanceiraAtual === 'caixa' && !recebido) return;
        const dataRef = visaoFinanceiraAtual === 'caixa'
            ? (p.data_pagamento || p.data_pedido || p.created_at)
            : (p.data_pedido || p.created_at);
        const dataInfo = extrairAnoMes(dataRef);
        if (dataInfo && dataInfo.ano === String(anoSel)) {
            const m = parseInt(dataInfo.mes, 10) - 1;
            if (m >= 0 && m < 12) {
                const qtd = parseInt(p.quantidade_unidades || p.quantidade || p.unidades || 1, 10) || 1;
                faturamentoPorMes[m] += (Number(p.valor_total || 0) * qtd);
            }
        }
    });

    const canvasEvolucao = document.getElementById('chart-evolucao-mensal');
    if (canvasEvolucao) {
        const ctxEvolucao = canvasEvolucao.getContext('2d');
        if (ctxEvolucao) {
            if (chartEvolucaoInstance) chartEvolucaoInstance.destroy();

            chartEvolucaoInstance = new Chart(ctxEvolucao, {
                type: 'bar',
                data: {
                    labels: mesesNomes,
                    datasets: [{
                        label: `${visaoFinanceiraAtual === 'caixa' ? 'Recebido' : 'Faturamento'} ${anoSel} (R$)`,
                        data: faturamentoPorMes,
                        backgroundColor: corDoTema('indigo', 500),
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: corDoTema('slate', 400), font: { size: 10 } }, grid: { display: false } },
                        y: { ticks: { color: corDoTema('slate', 400), font: { size: 10 } }, grid: { color: corDoTema('slate', 800) } }
                    }
                }
            });
        }
    }

    const canvasCanais = document.getElementById('chart-distribuicao-canais');
    if (canvasCanais) {
        const ctxCanais = canvasCanais.getContext('2d');
        if (ctxCanais) {
            if (chartCanaisInstance) chartCanaisInstance.destroy();

            chartCanaisInstance = new Chart(ctxCanais, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(contagemCanais || {}),
                    datasets: [{
                        data: Object.values(contagemCanais || {}),
                        backgroundColor: ['#EE4D2D', '#FFE600', '#2563EB', '#25D366'],
                        borderWidth: 2,
                        borderColor: corDoTema('slate', 900)
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: corDoTema('slate', 300), font: { size: 10 }, boxWidth: 12 }
                        }
                    }
                }
            });
        }
    }
}

// Exportações explícitas no escopo global
if (typeof window !== 'undefined') {
    window.toggleAccordion = toggleAccordion;
    window.inicializarModuloFinancas = inicializarModuloFinancas;
    window.carregarDadosFinanceiros = carregarDadosFinanceiros;
    window.alternarVisaoFinanceira = alternarVisaoFinanceira;

    // Configurações
    window.abrirModalConfiguracoes = abrirModalConfiguracoes;
    window.fecharModalConfiguracoes = fecharModalConfiguracoes;
    window.salvarConfiguracoes = salvarConfiguracoes;
    window.atualizarPreviaCustoHora = atualizarPreviaCustoHora;
    // Despesas e custos fixos são exportados por despesas.js
}
