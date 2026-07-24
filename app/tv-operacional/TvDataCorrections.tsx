'use client';

import { useEffect } from 'react';

function parseMoney(value: string | null | undefined) {
  const text = String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

function setStatus(element: Element, label: string, className: 'ok' | 'warn' | 'bad') {
  element.classList.remove('ok', 'warn', 'bad');
  element.classList.add(className);
  const nodes = Array.from(element.childNodes);
  const textNode = nodes.find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) textNode.textContent = ` ${label}`;
}

function applyCorrections() {
  const root = document.querySelector('main.tv');
  if (!root) return;

  const isDaily = root.classList.contains('daily');

  const metaValue = root.querySelector('.meta strong');
  if (metaValue && (!metaValue.textContent || metaValue.textContent.trim() === '--')) {
    metaValue.textContent = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date()).replace(':', 'h');
  }

  if (!isDaily) return;

  root.querySelectorAll('.coordStats span').forEach((element) => {
    if (element.textContent?.trim() === 'Vendido') element.textContent = 'Digitado';
  });

  root.querySelectorAll('.tableHeader.dailyCols span').forEach((element) => {
    if (element.textContent?.trim() === 'Vendido hoje') element.textContent = 'Digitado hoje';
  });

  root.querySelectorAll('.totalCard small').forEach((element) => {
    if (element.textContent?.trim() === 'Vendido hoje') element.textContent = 'Digitado hoje';
  });

  const rows = Array.from(root.querySelectorAll('.dataRow.dailyCols'));
  let eligible = 0;
  let delivered = 0;

  rows.forEach((row) => {
    const cells = row.children;
    if (cells.length < 5) return;

    const daily = parseMoney(cells[1].textContent);
    const paid = parseMoney(cells[3].textContent);
    const status = cells[4];

    if (daily <= 0) {
      setStatus(status, 'META ATINGIDA', 'ok');
      return;
    }

    eligible += 1;
    if (paid >= daily) {
      delivered += 1;
      setStatus(status, 'ENTREGUE', 'ok');
    } else if (paid >= daily * 0.5) {
      setStatus(status, 'ACELERA', 'warn');
    } else {
      setStatus(status, 'NÃO ENTREGUE', 'bad');
    }
  });

  const percentage = eligible ? Math.round((delivered / eligible) * 100) : 0;
  const splitMetric = root.querySelector('.insightMetric.split');
  const splitLabel = splitMetric?.querySelector('strong');
  const splitPercent = splitMetric?.querySelector('b');
  if (splitLabel) splitLabel.textContent = `${delivered} de ${eligible} lojas entregues`;
  if (splitPercent) splitPercent.textContent = `${percentage}%`;
}

export default function TvDataCorrections() {
  useEffect(() => {
    applyCorrections();

    const observer = new MutationObserver(() => applyCorrections());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    const timer = window.setInterval(applyCorrections, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
