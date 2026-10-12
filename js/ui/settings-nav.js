import { icon } from '../ih-icons.js';
import { html } from '../lib/html.js';

// Categorias de Configurações (kit A-Configuracoes / M-Configuracoes). Só entram as que existem de verdade:
// Conta, Notificações e Segurança moram no Perfil (o endereço leva direto à seção); a categoria própria da tela é a atual.
const CATEGORIES = {
  user: [
    { id: 'account', label: 'Conta', href: '#/perfil', icon: 'contatos' },
    { id: 'notifications', label: 'Notificações', href: '#/perfil#notificacoes', icon: 'bell' },
    { id: 'crm', label: 'CRM', href: '#/configuracoes', icon: 'pipeline' },
    { id: 'security', label: 'Segurança', href: '#/perfil#seguranca', icon: 'lock' },
  ],
  admin: [
    { id: 'account', label: 'Conta', href: '#/perfil', icon: 'contatos' },
    { id: 'organization', label: 'Organização', href: '#/configuracoes', icon: 'empresas' },
    { id: 'notifications', label: 'Notificações', href: '#/perfil#notificacoes', icon: 'bell' },
    { id: 'security', label: 'Segurança', href: '#/perfil#seguranca', icon: 'lock' },
  ],
};

/** Navegação lateral de categorias; `current` é o id da categoria desta tela (aria-current="page"). */
export function settingsNav(role, current) {
  const list = CATEGORIES[role === 'admin' || role === 'staff' ? 'admin' : 'user'];
  return html`<nav class="st-nav" aria-label="Categorias">${list.map(
    (item) => html`<a href="${item.href}"${item.id === current ? html` aria-current="page"` : ''}>${icon(item.icon)}<span>${item.label}</span></a>`,
  )}</nav>`;
}
