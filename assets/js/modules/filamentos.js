// assets/js/modules/filamentos.js
//
// Modelo de estoque:
// - Filamento = material + cor (ex: "PLA Preto"). Guarda o saldo total em gramas (peso_restante_g),
//   o custo médio por grama (custo_medio_g) e o estoque mínimo para alerta (estoque_minimo_g).
// - Cada compra é um registro em filamento_compras (data, marca, peso, valor, fornecedor).
//   Registrar uma compra soma o peso ao saldo e recalcula o custo médio (função registrar_compra_filamento).
// - Pedidos consomem do saldo; o saldo pode ficar negativo quando há pedidos aguardando material.

let listaFilamentosGlobal = [];
let listaComprasFilamentoGlobal = [];

const formatarMoeda = (valor) => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatarGramas = (valor) => `${Math.round(Number(valor || 0)).toLocaleString('pt-BR')}g`;

// Nome de exibição do filamento (a marca fica no histórico de compras)
function nomeFilamento(f) {
    if (!f) return 'Filamento';
    return `${f.material || ''} ${f.cor || ''}`.trim() || 'Filamento';
}

// "AAAA-MM-DD" -> "DD/MM/AAAA" sem passar por Date (evita o deslocamento de fuso)
function formatarDataCompra(valor) {
    const partes = typeof valor === 'string' && valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : '-';
}

// Carrega filamentos + compras e renderiza a tabela com os alertas de estoque mínimo
async function carregarFilamentos() {
    const tabelaBody = document.getElementById('lista-filamentos');

    try {
        const [
            { data: filamentos, error: errFilamentos },
            { data: compras, error: errCompras }
        ] = await Promise.all([
            _supabase.from('filamentos').select('*').order('material', { ascending: true }).order('cor', { ascending: true }),
            _supabase.from('filamento_compras').select('*').order('data_compra', { ascending: false }).order('id', { ascending: false })
        ]);

        if (errFilamentos) throw errFilamentos;
        if (errCompras) console.warn('Aviso ao carregar compras de filamento:', errCompras.message);

        listaFilamentosGlobal = filamentos || [];
        listaComprasFilamentoGlobal = compras || [];

        if (!tabelaBody) return;
        tabelaBody.innerHTML = '';

        let filamentosAbaixoDoMinimo = 0;
        let valorTotalEstoque = 0;
        let pesoTotalEstoque = 0;

        if (listaFilamentosGlobal.length === 0) {
            tabelaBody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-4 text-center text-slate-500 italic text-xs">Nenhum filamento cadastrado no estoque.</td>
                </tr>
            `;
        }

        listaFilamentosGlobal.forEach(f => {
            const saldo = Number(f.peso_restante_g || 0);
            const custoMedioG = Number(f.custo_medio_g || 0);
            const minimo = Number(f.estoque_minimo_g || 0);
            const valorEmEstoque = Math.max(saldo, 0) * custoMedioG;

            valorTotalEstoque += valorEmEstoque;
            pesoTotalEstoque += Math.max(saldo, 0);

            const isEmFalta = saldo < 0;
            const isEsgotado = saldo === 0;
            const isAbaixoMinimo = !isEmFalta && !isEsgotado && saldo <= minimo;
            if (isEmFalta || isEsgotado || isAbaixoMinimo) filamentosAbaixoDoMinimo++;

            let badgeStatus = '';
            if (isEmFalta) {
                badgeStatus = `
                    <span class="inline-flex items-center gap-1 bg-red-950/80 border border-red-700/60 text-red-300 text-[10px] font-bold px-2 py-0.5 rounded-md ml-2" title="Pedidos registrados precisam de mais filamento do que há em estoque.">
                        <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> Faltam ${formatarGramas(Math.abs(saldo))}
                    </span>
                `;
            } else if (isEsgotado) {
                badgeStatus = `
                    <span class="inline-flex items-center gap-1 bg-red-950/80 border border-red-700/60 text-red-300 text-[10px] font-bold px-2 py-0.5 rounded-md ml-2">
                        <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> Esgotado
                    </span>
                `;
            } else if (isAbaixoMinimo) {
                badgeStatus = `
                    <span class="inline-flex items-center gap-1 bg-amber-950/80 border border-amber-600/60 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-md ml-2" title="Saldo igual ou abaixo do estoque mínimo (${formatarGramas(minimo)}).">
                        <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Abaixo do mínimo
                    </span>
                `;
            }

            const ultimaCompra = listaComprasFilamentoGlobal.find(c => String(c.filamento_id) === String(f.id));
            const qtdCompras = listaComprasFilamentoGlobal.filter(c => String(c.filamento_id) === String(f.id)).length;
            const corSaldo = (isEmFalta || isEsgotado) ? 'text-red-400' : (isAbaixoMinimo ? 'text-amber-400' : 'text-slate-100');

            const row = document.createElement('tr');
            row.className = `hover:bg-slate-800/40 transition border-b border-slate-800/60 ${(isEmFalta || isEsgotado) ? 'bg-red-950/10' : (isAbaixoMinimo ? 'bg-amber-950/10' : '')}`;
            row.innerHTML = `
                <td class="py-2.5 px-4">
                    <div class="font-semibold text-slate-100">${nomeFilamento(f)}</div>
                    <div class="text-[10px] font-mono text-slate-500">#${f.id} · mín. ${formatarGramas(minimo)}</div>
                </td>
                <td class="py-2.5 px-4 font-mono whitespace-nowrap">
                    <span class="font-bold ${corSaldo}">${formatarGramas(saldo)}</span>
                    ${badgeStatus}
                </td>
                <td class="py-2.5 px-4 font-mono whitespace-nowrap">
                    <span class="text-slate-200 font-bold">${formatarMoeda(custoMedioG * 1000)}</span><span class="text-slate-500 text-[10px]">/kg</span>
                </td>
                <td class="py-2.5 px-4 font-mono text-emerald-400 font-bold whitespace-nowrap">${formatarMoeda(valorEmEstoque)}</td>
                <td class="py-2.5 px-4 text-[11px] whitespace-nowrap">
                    ${ultimaCompra ? `
                        <div class="text-slate-300">${formatarDataCompra(ultimaCompra.data_compra)} · ${ultimaCompra.marca || 'sem marca'}</div>
                        <div class="text-[10px] font-mono text-slate-500">${formatarGramas(ultimaCompra.peso_g)} por ${formatarMoeda(ultimaCompra.valor_pago)}</div>
                    ` : '<span class="text-slate-500 italic">Nenhuma compra</span>'}
                </td>
                <td class="py-2.5 px-4 text-right">
                    <div class="flex items-center justify-end gap-1.5 flex-wrap">
                        <button type="button" onclick="abrirModalCompraFilamento('${f.id}')" class="text-emerald-300 hover:text-emerald-200 font-bold transition px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-xs whitespace-nowrap">
                            🛒 + Compra
                        </button>
                        <button type="button" onclick="abrirModalHistoricoFilamento('${f.id}')" class="text-indigo-300 hover:text-indigo-200 font-semibold transition px-2 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-xs whitespace-nowrap">
                            📜 Histórico (${qtdCompras})
                        </button>
                        <button type="button" onclick="abrirModalEditarFilamento('${f.id}')" class="text-amber-400 hover:text-amber-300 transition px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-xs" title="Editar">
                            ✏️
                        </button>
                        <button type="button" onclick="excluirFilamento('${f.id}')" class="text-red-400 hover:text-red-300 transition px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-xs" title="Excluir">
                            🗑️
                        </button>
                    </div>
                </td>
            `;
            tabelaBody.appendChild(row);
        });

        const elValor = document.getElementById('resumo-valor-estoque');
        if (elValor) elValor.textContent = formatarMoeda(valorTotalEstoque);
        const elPeso = document.getElementById('resumo-peso-estoque');
        if (elPeso) elPeso.textContent = formatarGramas(pesoTotalEstoque);

        atualizarBannerEstoqueCritico(filamentosAbaixoDoMinimo);

    } catch (err) {
        console.error('Erro ao carregar filamentos:', err.message || err);
    }
}

// Banner de aviso para filamentos em falta, esgotados ou abaixo do estoque mínimo
function atualizarBannerEstoqueCritico(totalCriticos) {
    let banner = document.getElementById('alerta-estoque-critico');
    if (!banner) return;

    if (totalCriticos > 0) {
        banner.innerHTML = `
            <div class="p-3 bg-amber-950/40 border border-amber-600/40 rounded-xl text-amber-200 text-xs flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="text-base">⚠️</span>
                    <span><strong>Atenção ao Estoque:</strong> Existem <strong>${totalCriticos} filamento(s)</strong> em falta ou abaixo do estoque mínimo. Registre uma compra para não travar a fila de impressão.</span>
                </div>
            </div>
        `;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

// Recarrega as telas que dependem do estoque de filamento
function notificarMudancaEstoqueFilamento() {
    if (typeof carregarDadosFinanceiros === 'function') carregarDadosFinanceiros();
    if (typeof carregarPedidos === 'function') carregarPedidos();
    if (typeof carregarSugestoesInsumosCatalogo === 'function') carregarSugestoesInsumosCatalogo();
}

// Cadastra um novo filamento (material + cor). Peso e preço entram depois, pelas compras.
async function salvarFilamento(event) {
    if (event) event.preventDefault();

    const material = document.getElementById('filamento-material')?.value?.trim();
    const cor = document.getElementById('filamento-cor')?.value?.trim();
    const minimoInput = document.getElementById('filamento-estoque-minimo')?.value;
    const estoqueMinimo = minimoInput !== '' && minimoInput != null ? parseFloat(minimoInput) : 200;

    if (!material || !cor) {
        alert('Preencha o material e a cor!');
        return;
    }

    const jaExiste = listaFilamentosGlobal.find(f =>
        (f.material || '').trim().toLowerCase() === material.toLowerCase() &&
        (f.cor || '').trim().toLowerCase() === cor.toLowerCase()
    );
    if (jaExiste) {
        alert(`O filamento "${nomeFilamento(jaExiste)}" já está cadastrado. Para adicionar mais, use o botão "+ Compra" na linha dele.`);
        return;
    }

    try {
        const { data, error } = await _supabase.from('filamentos').insert([{
            material: material,
            cor: cor,
            estoque_minimo_g: estoqueMinimo,
            peso_restante_g: 0,
            peso_total_g: 0,
            preco_custo: 0,
            custo_medio_g: 0
        }]).select().single();

        if (error) throw error;

        document.getElementById('form-filamento')?.reset();
        await carregarFilamentos();
        notificarMudancaEstoqueFilamento();

        // Já abre o registro da primeira compra do filamento recém-criado
        if (data && confirm(`Filamento "${nomeFilamento(data)}" cadastrado com saldo 0g. Deseja registrar a primeira compra agora?`)) {
            abrirModalCompraFilamento(data.id);
        }
    } catch (err) {
        alert('Erro ao cadastrar filamento: ' + err.message);
    }
}

// ==========================================
// EDIÇÃO (material, cor, mínimo e ajuste manual de saldo)
// ==========================================
function abrirModalEditarFilamento(id) {
    const filamento = listaFilamentosGlobal.find(f => String(f.id) === String(id));
    if (!filamento) return;

    document.getElementById('input-editar-carretel-id').value = filamento.id;
    document.getElementById('input-editar-filamento-material').value = filamento.material || '';
    document.getElementById('input-editar-filamento-cor').value = filamento.cor || '';
    document.getElementById('input-editar-filamento-minimo').value = filamento.estoque_minimo_g ?? 200;
    document.getElementById('input-editar-filamento-peso').value = filamento.peso_restante_g ?? 0;

    const modal = document.getElementById('modal-editar-filamento');
    if (modal) modal.classList.remove('hidden');
}

function fecharModalEditarFilamento() {
    const modal = document.getElementById('modal-editar-filamento');
    if (modal) modal.classList.add('hidden');
}

async function salvarEdicaoFilamento(event) {
    if (event) event.preventDefault();

    const id = document.getElementById('input-editar-carretel-id')?.value;
    if (!id) return;

    const material = document.getElementById('input-editar-filamento-material')?.value?.trim();
    const cor = document.getElementById('input-editar-filamento-cor')?.value?.trim();
    const estoqueMinimo = parseFloat(document.getElementById('input-editar-filamento-minimo')?.value) || 0;
    const saldo = parseFloat(document.getElementById('input-editar-filamento-peso')?.value) || 0;

    if (!material || !cor) {
        alert('Preencha o material e a cor!');
        return;
    }

    try {
        const { error } = await _supabase
            .from('filamentos')
            .update({
                material: material,
                cor: cor,
                estoque_minimo_g: estoqueMinimo,
                peso_restante_g: saldo
            })
            .eq('id', id);

        if (error) throw error;

        fecharModalEditarFilamento();
        await carregarFilamentos();
        notificarMudancaEstoqueFilamento();
    } catch (err) {
        alert('Erro ao atualizar filamento: ' + err.message);
    }
}

async function excluirFilamento(id) {
    const filamento = listaFilamentosGlobal.find(f => String(f.id) === String(id));
    const nome = filamento ? nomeFilamento(filamento) : 'este filamento';
    if (!confirm(`Deseja realmente excluir "${nome}" do estoque?\n\nTodo o histórico de compras dele também será apagado, e os produtos ligados a ele deixarão de descontar estoque.`)) return;

    try {
        const { error } = await _supabase.from('filamentos').delete().eq('id', id);
        if (error) throw error;

        await carregarFilamentos();
        notificarMudancaEstoqueFilamento();
    } catch (err) {
        alert('Erro ao excluir filamento: ' + err.message);
    }
}

// ==========================================
// COMPRAS
// ==========================================
function abrirModalCompraFilamento(id) {
    const filamento = listaFilamentosGlobal.find(f => String(f.id) === String(id));
    if (!filamento) return;

    document.getElementById('form-compra-filamento')?.reset();
    document.getElementById('input-compra-filamento-id').value = filamento.id;
    document.getElementById('compra-filamento-nome').textContent = nomeFilamento(filamento);

    const hoje = new Date();
    const hojeLocal = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    document.getElementById('input-compra-data').value = hojeLocal;
    document.getElementById('input-compra-peso').value = 1000;

    // Sugere as marcas já usadas e pré-preenche com a da última compra deste filamento
    const marcas = [...new Set(listaComprasFilamentoGlobal.map(c => c.marca).filter(Boolean))];
    const datalist = document.getElementById('lista-marcas-filamento');
    if (datalist) datalist.innerHTML = marcas.map(m => `<option value="${m}"></option>`).join('');

    const ultimaCompra = listaComprasFilamentoGlobal.find(c => String(c.filamento_id) === String(filamento.id));
    document.getElementById('input-compra-marca').value = ultimaCompra?.marca || '';

    atualizarPreviaCompraFilamento();

    const modal = document.getElementById('modal-compra-filamento');
    if (modal) modal.classList.remove('hidden');
    document.getElementById('input-compra-valor')?.focus();
}

function fecharModalCompraFilamento() {
    const modal = document.getElementById('modal-compra-filamento');
    if (modal) modal.classList.add('hidden');
}

// Mostra, antes de salvar, como ficam o saldo e o custo médio (mesma conta da função no banco)
function atualizarPreviaCompraFilamento() {
    const previa = document.getElementById('previa-compra-filamento');
    const id = document.getElementById('input-compra-filamento-id')?.value;
    const filamento = listaFilamentosGlobal.find(f => String(f.id) === String(id));
    if (!previa || !filamento) return;

    const peso = parseFloat(document.getElementById('input-compra-peso')?.value) || 0;
    const valor = parseFloat(document.getElementById('input-compra-valor')?.value) || 0;

    const saldoAtual = Number(filamento.peso_restante_g || 0);
    const custoAtualG = Number(filamento.custo_medio_g || 0);
    const saldoValorizado = Math.max(saldoAtual, 0);
    const novoSaldo = saldoAtual + peso;
    const novoCustoG = (saldoValorizado + peso) > 0 ? ((saldoValorizado * custoAtualG) + valor) / (saldoValorizado + peso) : 0;
    const custoCompraG = peso > 0 ? valor / peso : 0;

    previa.innerHTML = `
        <div class="flex justify-between text-slate-400"><span>Saldo atual</span><span class="${saldoAtual < 0 ? 'text-red-400' : 'text-slate-200'}">${formatarGramas(saldoAtual)} · ${formatarMoeda(custoAtualG * 1000)}/kg</span></div>
        <div class="flex justify-between text-slate-400"><span>Esta compra</span><span class="text-slate-200">+ ${formatarGramas(peso)} · ${formatarMoeda(custoCompraG * 1000)}/kg</span></div>
        <div class="flex justify-between font-bold border-t border-slate-800 pt-1"><span class="text-slate-300">Novo saldo</span><span class="${novoSaldo < 0 ? 'text-red-400' : 'text-emerald-400'}">${formatarGramas(novoSaldo)} · ${formatarMoeda(novoCustoG * 1000)}/kg</span></div>
        ${saldoAtual < 0 ? `<div class="text-[10px] text-amber-300 font-sans pt-0.5">Os ${formatarGramas(Math.abs(saldoAtual))} em falta serão cobertos por esta compra.</div>` : ''}
    `;
}

async function salvarCompraFilamento(event) {
    if (event) event.preventDefault();

    const filamentoId = document.getElementById('input-compra-filamento-id')?.value;
    const peso = parseFloat(document.getElementById('input-compra-peso')?.value);
    const valor = parseFloat(document.getElementById('input-compra-valor')?.value);

    if (!filamentoId || !(peso > 0) || isNaN(valor) || valor < 0) {
        alert('Informe o peso comprado e o valor pago.');
        return;
    }

    const btn = document.getElementById('btn-salvar-compra-filamento');
    if (btn) btn.disabled = true;

    try {
        const { error } = await _supabase.rpc('registrar_compra_filamento', {
            p_filamento_id: parseInt(filamentoId, 10),
            p_data: document.getElementById('input-compra-data')?.value || null,
            p_marca: document.getElementById('input-compra-marca')?.value || null,
            p_peso_g: peso,
            p_valor: valor,
            p_fornecedor: document.getElementById('input-compra-fornecedor')?.value || null
        });

        if (error) throw error;

        fecharModalCompraFilamento();
        await carregarFilamentos();
        notificarMudancaEstoqueFilamento();
    } catch (err) {
        alert('Erro ao registrar compra: ' + err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ==========================================
// HISTÓRICO DE COMPRAS
// ==========================================
let filamentoHistoricoAbertoId = null;

function abrirModalHistoricoFilamento(id) {
    const filamento = listaFilamentosGlobal.find(f => String(f.id) === String(id));
    if (!filamento) return;

    filamentoHistoricoAbertoId = filamento.id;
    renderizarHistoricoFilamento();

    const modal = document.getElementById('modal-historico-filamento');
    if (modal) modal.classList.remove('hidden');
}

function fecharModalHistoricoFilamento() {
    filamentoHistoricoAbertoId = null;
    const modal = document.getElementById('modal-historico-filamento');
    if (modal) modal.classList.add('hidden');
}

function renderizarHistoricoFilamento() {
    const filamento = listaFilamentosGlobal.find(f => String(f.id) === String(filamentoHistoricoAbertoId));
    const body = document.getElementById('historico-filamento-body');
    if (!filamento || !body) return;

    document.getElementById('historico-filamento-nome').textContent = nomeFilamento(filamento);

    const compras = listaComprasFilamentoGlobal.filter(c => String(c.filamento_id) === String(filamento.id));
    const totalPeso = compras.reduce((acc, c) => acc + Number(c.peso_g || 0), 0);
    const totalValor = compras.reduce((acc, c) => acc + Number(c.valor_pago || 0), 0);

    document.getElementById('historico-filamento-resumo').innerHTML = `
        <div class="bg-slate-950/60 border border-slate-800 rounded-xl p-2">
            <span class="block text-[10px] text-slate-500 uppercase font-bold">Total comprado</span>
            <span class="font-mono font-bold text-slate-200">${formatarGramas(totalPeso)}</span>
        </div>
        <div class="bg-slate-950/60 border border-slate-800 rounded-xl p-2">
            <span class="block text-[10px] text-slate-500 uppercase font-bold">Total gasto</span>
            <span class="font-mono font-bold text-emerald-400">${formatarMoeda(totalValor)}</span>
        </div>
        <div class="bg-slate-950/60 border border-slate-800 rounded-xl p-2">
            <span class="block text-[10px] text-slate-500 uppercase font-bold">Custo médio atual</span>
            <span class="font-mono font-bold text-indigo-300">${formatarMoeda(Number(filamento.custo_medio_g || 0) * 1000)}/kg</span>
        </div>
    `;

    if (compras.length === 0) {
        body.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-slate-500 italic">Nenhuma compra registrada.</td></tr>`;
        return;
    }

    body.innerHTML = compras.map(c => {
        const custoKg = Number(c.peso_g) > 0 ? (Number(c.valor_pago) / Number(c.peso_g)) * 1000 : 0;
        return `
            <tr class="hover:bg-slate-800/40">
                <td class="py-1.5 px-2 font-mono whitespace-nowrap">${formatarDataCompra(c.data_compra)}</td>
                <td class="py-1.5 px-2">${c.marca || '<span class="text-slate-500 italic">-</span>'}</td>
                <td class="py-1.5 px-2 text-right font-mono">${formatarGramas(c.peso_g)}</td>
                <td class="py-1.5 px-2 text-right font-mono text-emerald-400">${formatarMoeda(c.valor_pago)}</td>
                <td class="py-1.5 px-2 text-right font-mono text-slate-400">${formatarMoeda(custoKg)}</td>
                <td class="py-1.5 px-2 text-slate-400 truncate max-w-[140px]" title="${c.observacao || ''}">${c.fornecedor || '<span class="text-slate-500 italic">-</span>'}</td>
                <td class="py-1.5 px-2 text-right">
                    <button type="button" onclick="excluirCompraFilamento(${c.id})" class="text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-500/10" title="Excluir compra lançada errada">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function excluirCompraFilamento(compraId) {
    const compra = listaComprasFilamentoGlobal.find(c => String(c.id) === String(compraId));
    if (!compra) return;

    if (!confirm(`Excluir a compra de ${formatarGramas(compra.peso_g)} (${formatarMoeda(compra.valor_pago)}) de ${formatarDataCompra(compra.data_compra)}?\n\nO peso sai do saldo e o custo médio é recalculado pelas compras que sobrarem. Use apenas para corrigir lançamento errado.`)) return;

    try {
        const { error } = await _supabase.rpc('excluir_compra_filamento', { p_compra_id: compra.id });
        if (error) throw error;

        await carregarFilamentos();
        renderizarHistoricoFilamento();
        notificarMudancaEstoqueFilamento();
    } catch (err) {
        alert('Erro ao excluir compra: ' + err.message);
    }
}

window.abrirModalEditarFilamento = abrirModalEditarFilamento;
window.fecharModalEditarFilamento = fecharModalEditarFilamento;
window.salvarEdicaoFilamento = salvarEdicaoFilamento;

document.addEventListener('DOMContentLoaded', () => {
    carregarFilamentos();
});
