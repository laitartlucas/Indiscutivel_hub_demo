// Atalhos de teclado que existem de verdade no app (a lista da Ajuda só mostra o que está implementado).

export function isMac(platform = globalThis.navigator?.platform ?? '') {
  return /mac|iphone|ipad/i.test(platform);
}

/** "Ctrl K" ou "⌘ K", conforme o sistema. */
export function searchShortcutLabel(platform) {
  return isMac(platform) ? '⌘ K' : 'Ctrl K';
}

/** Grupos de atalhos: [{ title, items: [{ keys: [['Ctrl','K'], ['/']], text }] }]. Cada `keys[i]` é uma alternativa. */
export function shortcutGroups(platform) {
  const mod = isMac(platform) ? '⌘' : 'Ctrl';
  return [
    {
      title: 'Em qualquer tela',
      items: [
        { keys: [['/'], [mod, 'K']], text: 'Ir para a busca' },
        { keys: [['Esc']], text: 'Fechar a busca, os menus, o sino e os diálogos' },
        { keys: [['Tab'], ['Shift', 'Tab']], text: 'Avançar e voltar entre os campos e botões' },
      ],
    },
    {
      title: 'Busca, sino e menus',
      items: [
        { keys: [['↑'], ['↓']], text: 'Mover entre os resultados, as notificações e as opções dos menus' },
        { keys: [['Enter']], text: 'Abrir o resultado ou a opção selecionada' },
        { keys: [['Home'], ['End']], text: 'Ir à primeira ou à última opção de um menu' },
        { keys: [['←'], ['→']], text: 'Trocar de aba (Todas e Não lidas, abas de Tarefas)' },
      ],
    },
    {
      title: 'Calendário',
      items: [
        { keys: [['←'], ['→'], ['↑'], ['↓']], text: 'Mover entre os dias' },
        { keys: [['Page Up'], ['Page Down']], text: 'Mês anterior e seguinte' },
        { keys: [['Enter'], ['Espaço']], text: 'Abrir o dia selecionado' },
      ],
    },
  ];
}
