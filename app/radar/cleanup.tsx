'use client';

import { useEffect } from 'react';

const STORE_PREFIX = /^\s*\d{4,6}\s*-\s*help!?\s*(?:[-–—]\s*)?(?:[A-Z]{2}\s*)?/i;

export default function RadarCleanup() {
  useEffect(() => {
    const clean = () => {
      document
        .querySelectorAll<HTMLElement>('.mini-ranking b, .store-table .trow > span:first-child b, .ranking-table .rank-row > b, .priority b, .risk b')
        .forEach((node) => {
          const original = node.textContent || '';
          const cleaned = original.replace(STORE_PREFIX, '').replace(/^[-–—]\s*/, '').trim();
          if (cleaned && cleaned !== original) {
            node.textContent = cleaned;
            node.title = cleaned;
          }
        });
    };

    clean();
    const observer = new MutationObserver(clean);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
