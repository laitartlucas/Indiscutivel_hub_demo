import { parseMoney } from '../../shared/money.js';
import { ApiError } from '../lib/api.js';
import { html } from '../lib/html.js';
import { pageInfo } from '../lib/query.js';
import { renderShell } from '../shell.js';
import { alert, badge, button, emptyState, enhancePasswordToggles, field, passwordField, skeleton } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { attachForm } from '../ui/form.js';
import { openFormDialog } from '../ui/form-dialog.js';
import { dataTable, pager } from '../ui/table.js';
import { toast } from '../ui/toast.js';

const LIST_EXAMPLE_ROWS = [
  { id: 1, name: 'Maria Souza', value: '4.800,00' },
  { id: 2, name: 'João Prado', value: '2.100,00' },
  { id: 3, name: 'Larissa Fontes', value: '980,00' },
];

export function renderStyleguide({ root, session, navigate }) {
  const content = html`<div class="stack">
    <p class="muted">Referência visual dos elementos do sistema. Usada para revisar contraste, foco e estados.</p>

    <section class="stack" aria-labelledby="sg-cores"><h2 id="sg-cores">Cores</h2>
      <div class="swatches">
        <div class="swatch swatch-bg">Fundo</div><div class="swatch swatch-surface">Superfície</div>
        <div class="swatch swatch-raised">Superfície elevada</div><div class="swatch swatch-accent">Ação principal</div>
        <div class="swatch swatch-good">Sucesso</div><div class="swatch swatch-warn">Atenção</div><div class="swatch swatch-bad">Erro</div>
      </div></section>

    <section class="stack" aria-labelledby="sg-botoes"><h2 id="sg-botoes">Botões</h2>
      <div class="row">${button({ label: 'Principal' })}${button({ label: 'Secundário', variant: 'ghost' })}${button({ label: 'Excluir', variant: 'danger' })}${button({ label: 'Desabilitado', disabled: true })}${button({ label: 'Salvando', loading: true })}</div></section>

    <section class="stack" aria-labelledby="sg-campos"><h2 id="sg-campos">Campos</h2>
      ${field({ id: 'sg-nome', label: 'Nome', hint: 'Como aparece para a equipe.' })}
      ${field({ id: 'sg-email-erro', label: 'E-mail com erro', type: 'email', value: 'nome@', error: 'Informe um e-mail válido.' })}
      ${passwordField({ id: 'sg-senha', label: 'Senha de exemplo', autocomplete: 'off' })}</section>

    <section class="stack" aria-labelledby="sg-alertas"><h2 id="sg-alertas">Alertas e selos</h2>
      ${alert({ tone: 'info', title: 'Informação', message: 'Mensagem informativa.' })}
      ${alert({ tone: 'success', title: 'Tudo certo', message: 'A alteração foi salva.' })}
      ${alert({ tone: 'warn', title: 'Atenção', message: 'Revise os dados antes de continuar.' })}
      ${alert({ tone: 'danger', title: 'Erro', message: 'Não foi possível concluir.' })}
      <div class="row">${badge('Neutro')}${badge('Ganha', 'good')}${badge('Pendente', 'warn')}${badge('Perdida', 'bad')}${badge('Quente', 'accent')}</div></section>

    <section class="stack" aria-labelledby="sg-estados"><h2 id="sg-estados">Estados</h2>
      <div class="card">${emptyState({ title: 'Nada por aqui ainda', message: 'Quando houver itens, eles aparecem nesta lista.' })}</div>
      <div class="card">${skeleton(4)}</div></section>

    <section class="stack" aria-labelledby="sg-interacao"><h2 id="sg-interacao">Avisos e diálogos</h2>
      <div class="row">${button({ label: 'Mostrar aviso', variant: 'ghost', id: 'sg-toast' })}${button({ label: 'Abrir diálogo de confirmação', variant: 'ghost', id: 'sg-dialog' })}${button({ label: 'Aviso de erro persistente', variant: 'ghost', id: 'sg-toast-danger' })}${button({ label: 'Abrir diálogo simples', variant: 'ghost', id: 'sg-dialog-simple' })}<span id="dialog-result" class="muted" role="status"></span></div></section>

    <section class="stack" aria-labelledby="sg-lista"><h2 id="sg-lista">Lista</h2>
      <p class="muted">Barra de ferramentas, tabela em região rolável com legenda e paginador com a contagem anunciada.</p>
      <div class="toolbar">
        <div class="toolbar-search">${field({ id: 'sg-list-search', label: 'Buscar', name: 'busca', type: 'search' })}</div>
        <div class="toolbar-actions">${button({ label: 'Novo item', variant: 'ghost' })}</div>
      </div>
      ${dataTable({
        caption: 'Exemplo de lista',
        columns: [
          { key: 'name', label: 'Nome' },
          { key: 'value', label: 'Valor', align: 'end' },
          { key: 'actions', label: 'Ações', render: (row) => button({ label: `Editar ${row.name}`, variant: 'ghost', extra: { 'data-row-id': String(row.id) } }) },
        ],
        rows: LIST_EXAMPLE_ROWS,
      })}
      ${pager({ info: pageInfo({ limit: 3, offset: 0, total: 7 }), total: 7 })}
      <div class="row">${button({ label: 'Abrir formulário em diálogo', variant: 'ghost', id: 'sg-dialog-form' })}<span id="dialog-form-result" class="muted" role="status"></span></div></section>

    <section class="stack" aria-labelledby="sg-formulario"><h2 id="sg-formulario">Formulário</h2>
      <p class="muted">Prova o padrão de formulários: erro no lugar ao sair do campo, nada digitado se perde e o envio é único.</p>
      <form id="sg-form" novalidate class="card">
        ${field({ id: 'sg-form-nome', label: 'Nome', name: 'nome', required: true })}
        ${field({ id: 'sg-form-valor', label: 'Valor', name: 'valor', inputmode: 'decimal' })}
        ${button({ label: 'Salvar exemplo', type: 'submit', busyLabel: 'Salvando…' })}
      </form></section>
  </div>`;
  const disposeShell = renderShell({ root, session, navigate, active: '', heading: 'Guia de componentes', content });

  let disposed = false;
  const showResult = (ok) => {
    if (!disposed) root.querySelector('#dialog-result').textContent = ok ? 'Confirmado' : 'Cancelado';
  };

  enhancePasswordToggles(root);
  root.querySelector('#sg-toast').addEventListener('click', () => toast('Alteração salva.', { tone: 'success' }));
  root.querySelector('#sg-toast-danger').addEventListener('click', () => toast('Falha ao salvar.', { tone: 'danger' }));
  root.querySelector('#sg-dialog-simple').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Continuar?', message: 'Você pode voltar depois.' });
    showResult(ok);
  });
  root.querySelector('#sg-dialog').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Excluir item?', message: 'Esta ação não pode ser desfeita.', confirmLabel: 'Excluir', tone: 'danger' });
    showResult(ok);
  });

  let dialogFormSubmits = 0;
  root.querySelector('#sg-dialog-form').addEventListener('click', async () => {
    await openFormDialog({
      title: 'Formulário de exemplo',
      submitLabel: 'Salvar',
      body: field({ id: 'sg-dialog-form-nome', label: 'Nome', name: 'name', required: true }),
      validators: {
        name: (value) => (value.trim() ? null : 'Informe o nome.'),
      },
      onSubmit: async (values) => {
        if (values.name === 'Nome que o servidor recusa') {
          throw new ApiError({
            status: 422,
            code: 'validation_error',
            detail: 'Dados inválidos.',
            errors: [{ field: 'name', message: 'O servidor recusou este nome.' }],
          });
        }
        // Simula a latência de uma chamada real para provar o envio único (busy) mesmo com Enter duplo.
        await new Promise((resolve) => setTimeout(resolve, 300));
        dialogFormSubmits += 1;
        if (!disposed) {
          const result = root.querySelector('#dialog-form-result');
          if (result) result.textContent = `Enviado ${dialogFormSubmits} vez${dialogFormSubmits === 1 ? '' : 'es'}`;
        }
      },
    });
  });

  // Marca o elemento do campo Nome para o E2E provar que o formulário não é redesenhado.
  root.querySelector('#sg-form-nome').__marca = 1;
  attachForm(root.querySelector('#sg-form'), {
    validators: {
      nome: (value) => (value.trim() ? null : 'Informe o nome.'),
      valor: (value) => {
        const result = parseMoney(value);
        return result.ok ? null : result.message;
      },
    },
    onSubmit: async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      toast('Exemplo salvo.', { tone: 'success' });
    },
  });

  return () => {
    disposed = true;
    disposeShell();
  };
}
