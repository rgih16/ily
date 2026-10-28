// assets/js/modules/filamentos.js

let listaFilamentosGlobal = [];

// Carrega a lista de filamentos do Supabase e renderiza na tabela com alertas de 15%
async function carregarFilamentos() {
    const tabelaBody = document.getElementById('lista-filamentos');
    if (!tabelaBody) return;

    try {
        const client = _supabase;
        if (!client) {
            console.error("Cliente Supabase não encontrado.");
            return;
        }

        const { data: filamentos, error } = await client
            .from('filamentos')
            .select('*')
            .order('id', { ascending: false });

        if (error) throw error;

        listaFilamentosGlobal = filamentos || [];
        tabelaBody.innerHTML = '';

        // Contabiliza carretéis críticos (<= 15%) para banner superior
        let carreteisCriticos = 0;

        if (listaFilamentosGlobal.length === 0) {
            tabelaBody.innerHTML = `
                <tr>
                    <td colspan="7" class="py-4 text-center text-slate-500 italic text-xs">Nenhum carretel cadastrado no estoque.</td>
                </tr>
            `;
            atualizarBannerEstoqueCritico(0);
            return;
        }

        listaFilamentosGlobal.forEach(f => {
            const pesoTotal = f.peso_total_g ?? f.peso_total ?? 1000;
            const pesoRestante = f.peso_restante_g ?? f.peso_restante ?? 0;
            const precoCusto = Number(f.preco_custo || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            // Cálculo da porcentagem restante
            const pctRestante = pesoTotal > 0 ? (pesoRestante / pesoTotal) * 100 : 0;
            const isCritico = pctRestante <= 15 && pesoRestante > 0;
            const isEsgotado = pesoRestante <= 0;

            if (isCritico || isEsgotado) {
                carreteisCriticos++;
            }

            // Badges visuais de estoque
            let badgeStatus = '';
            if (isEsgotado) {
                badgeStatus = `
                    <span class="inline-flex items-center gap-1 bg-red-950/80 border border-red-700/60 text-red-300 text-[10px] font-bold px-2 py-0.5 rounded-md animate-pulse ml-2" title="Carretel Zerado!">
                        <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> Esgotado (0%)
                    </span>
                `;
            } else if (isCritico) {
                badgeStatus = `
                    <span class="inline-flex items-center gap-1 bg-amber-950/80 border border-amber-600/60 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-md animate-pulse ml-2" title="Estoque abaixo de 15%! Recomenda-se reposição.">
                        <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> ⚠️ Crítico (${pctRestante.toFixed(0)}%)
                    </span>
                `;
            }

            const row = document.createElement('tr');
            row.className = `hover:bg-slate-800/40 transition border-b border-slate-800/60 ${isCritico ? 'bg-amber-950/10' : ''} ${isEsgotado ? 'bg-red-950/10' : ''}`;
            row.innerHTML = `
                <td class="py-2.5 px-4 font-mono font-bold text-indigo-400">#${f.id}</td>
                <td class="py-2.5 px-4 font-semibold text-slate-100">${f.marca || '-'}</td>
                <td class="py-2.5 px-4 text-slate-300">${f.material || '-'}</td>
                <td class="py-2.5 px-4 text-slate-300">${f.cor || '-'}</td>
                <td class="py-2.5 px-4 font-mono">
                    <span class="font-bold ${isEsgotado ? 'text-red-400' : (isCritico ? 'text-amber-400' : 'text-slate-200')}">
                        ${pesoRestante}g
                    </span>
                    <span class="text-slate-500 text-[11px]">/ ${pesoTotal}g</span>
                    ${badgeStatus}
                </td>
                <td class="py-2.5 px-4 font-mono text-emerald-400 font-bold">${precoCusto}</td>
                <td class="py-2.5 px-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                        <button type="button" onclick="abrirModalEditarFilamento('${f.id}')" class="text-amber-400 hover:text-amber-300 font-semibold transition px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-xs">
                            ✏️ Editar
                        </button>
                        <button type="button" onclick="excluirFilamento('${f.id}')" class="text-red-400 hover:text-red-300 font-semibold transition px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-xs">
                            🗑️ Excluir
                        </button>
                    </div>
                </td>
            `;
            tabelaBody.appendChild(row);
        });

        atualizarBannerEstoqueCritico(carreteisCriticos);

    } catch (err) {
        console.error('Erro ao carregar filamentos:', err.message);
    }
}

// Atualiza o banner visual de aviso caso haja carretéis com <= 15%
function atualizarBannerEstoqueCritico(totalCriticos) {
    let banner = document.getElementById('alerta-estoque-critico');
    if (!banner) return;

    if (totalCriticos > 0) {
        banner.innerHTML = `
            <div class="p-3 bg-amber-950/40 border border-amber-600/40 rounded-xl text-amber-200 text-xs flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="text-base">⚠️</span>
                    <span><strong>Atenção ao Estoque:</strong> Existem <strong>${totalCriticos} carretel(is)</strong> com estoque crítico igual ou menor que 15%. Providencie a reposição para não travar a fila de impressão.</span>
                </div>
            </div>
        `;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

// Salva um novo carretel de filamento
async function salvarFilamento(event) {
    if (event) event.preventDefault();

    const marca = document.getElementById('filamento-marca')?.value?.trim();
    const material = document.getElementById('filamento-material')?.value?.trim();
    const cor = document.getElementById('filamento-cor')?.value?.trim();
    const pesoTotal = parseFloat(document.getElementById('filamento-peso')?.value) || 1000;
    const pesoRestanteInput = document.getElementById('filamento-peso-restante')?.value;
    const pesoRestante = pesoRestanteInput ? parseFloat(pesoRestanteInput) : pesoTotal;
    const preco = parseFloat(document.getElementById('filamento-preco')?.value) || 0;

    if (!marca || !material || !cor) {
        alert('Preencha os campos obrigatórios!');
        return;
    }

    const agoraISO = new Date().toISOString();

    try {
        const client = _supabase;
        const { error } = await client.from('filamentos').insert([{
            marca: marca,
            material: material,
            cor: cor,
            peso_total_g: pesoTotal,
            peso_restante_g: pesoRestante,
            peso_total: pesoTotal,
            peso_restante: pesoRestante,
            preco_custo: preco,
            created_at: agoraISO,
            data_compra: agoraISO.split('T')[0]
        }]);

        if (error) throw error;

        document.getElementById('form-filamento')?.reset();
        await carregarFilamentos();

        // Notifica finanças e kanban em tempo real para reavaliar alertas
        if (typeof carregarDadosFinanceiros === 'function') {
            carregarDadosFinanceiros();
        }
        if (typeof carregarPedidos === 'function') {
            carregarPedidos();
        }
    } catch (err) {
        alert('Erro ao cadastrar filamento: ' + err.message);
    }
}

// Modal de edição de filamentos
function abrirModalEditarFilamento(id) {
    const filamento = listaFilamentosGlobal.find(f => String(f.id) === String(id));
    if (!filamento) return;

    if (document.getElementById('input-editar-carretel-id')) document.getElementById('input-editar-carretel-id').value = filamento.id;
    if (document.getElementById('input-editar-filamento-marca')) document.getElementById('input-editar-filamento-marca').value = filamento.marca || '';
    if (document.getElementById('input-editar-filamento-material')) document.getElementById('input-editar-filamento-material').value = filamento.material || '';
    if (document.getElementById('input-editar-filamento-cor')) document.getElementById('input-editar-filamento-cor').value = filamento.cor || '';
    if (document.getElementById('input-editar-filamento-peso')) document.getElementById('input-editar-filamento-peso').value = filamento.peso_restante_g ?? filamento.peso_restante ?? 1000;
    if (document.getElementById('input-editar-filamento-preco')) document.getElementById('input-editar-filamento-preco').value = filamento.preco_custo || 0;

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

    const marca = document.getElementById('input-editar-filamento-marca')?.value;
    const material = document.getElementById('input-editar-filamento-material')?.value;
    const cor = document.getElementById('input-editar-filamento-cor')?.value;
    const pesoRestante = parseFloat(document.getElementById('input-editar-filamento-peso')?.value) || 0;
    const preco = parseFloat(document.getElementById('input-editar-filamento-preco')?.value) || 0;

    try {
        const client = _supabase;
        const { error } = await client
            .from('filamentos')
            .update({
                marca: marca,
                material: material,
                cor: cor,
                peso_restante_g: pesoRestante,
                peso_restante: pesoRestante,
                preco_custo: preco
            })
            .eq('id', id);

        if (error) throw error;

        fecharModalEditarFilamento();
        await carregarFilamentos();

        if (typeof carregarDadosFinanceiros === 'function') {
            carregarDadosFinanceiros();
        }
        if (typeof carregarPedidos === 'function') {
            carregarPedidos();
        }
    } catch (err) {
        alert('Erro ao atualizar carretel: ' + err.message);
    }
}

async function excluirFilamento(id) {
    if (!confirm('Deseja realmente excluir este carretel do estoque?')) return;

    try {
        const client = _supabase;
        const { error } = await client.from('filamentos').delete().eq('id', id);
        if (error) throw error;

        await carregarFilamentos();

        if (typeof carregarDadosFinanceiros === 'function') {
            carregarDadosFinanceiros();
        }
        if (typeof carregarPedidos === 'function') {
            carregarPedidos();
        }
    } catch (err) {
        alert('Erro ao excluir filamento: ' + err.message);
    }
}

window.abrirModalEditarFilamento = abrirModalEditarFilamento;
window.fecharModalEditarFilamento = fecharModalEditarFilamento;
window.salvarEdicaoFilamento = salvarEdicaoFilamento;

document.addEventListener('DOMContentLoaded', () => {
    carregarFilamentos();
});