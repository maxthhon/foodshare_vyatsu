import { AlertCircle, ChevronLeft, ChevronRight, Leaf, LoaderCircle, MapPin, PackageOpen, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { statusLabels } from './format';
import type { OrderStatus } from './types';

export function Brand() {
  return <Link className="brand" to="/" aria-label="FoodShare, главная"><span className="brand-mark"><Leaf size={20} /></span>FoodShare</Link>;
}

export function PageTitle({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{detail && <p className="muted">{detail}</p>}</div>{action}</div>;
}

export function Notice({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <div className={warning ? 'notice warning' : 'notice'} role={warning ? 'alert' : 'status'}><AlertCircle size={20} /> <div>{children}</div></div>;
}

export function Loading() {
  return <div className="feedback" role="status"><LoaderCircle className="animate-spin" size={22} /> Загружаем…</div>;
}

export function ErrorState({ error, retry }: { error: string; retry: () => void }) {
  return <div className="feedback" role="alert"><AlertCircle size={24} /><p>{error}</p><button className="button secondary" onClick={retry}>Повторить</button></div>;
}

export function Empty({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  return <div className="feedback empty"><PackageOpen size={30} /><strong>{title}</strong>{detail && <p className="muted">{detail}</p>}{children}</div>;
}

export function Pagination({ page, hasMore, onChange }: { page: number; hasMore: boolean; onChange: (page: number) => void }) {
  if (page === 1 && !hasMore) return null;
  return <nav className="pagination" aria-label="Страницы">
    <button className="icon-button" disabled={page === 1} onClick={() => onChange(page - 1)} aria-label="Предыдущая страница"><ChevronLeft size={20} /></button>
    <span>Страница {page}</span>
    <button className="icon-button" disabled={!hasMore} onClick={() => onChange(page + 1)} aria-label="Следующая страница"><ChevronRight size={20} /></button>
  </nav>;
}

export function Status({ status }: { status: OrderStatus }) {
  return <span className={`status status-${status.toLowerCase()}`}>{statusLabels[status]}</span>;
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} aria-label={title} className="dialog" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="dialog-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={20} /></button></div>
    {children}
  </dialog>;
}

export function Place({ children }: { children: ReactNode }) {
  return <span className="meta"><MapPin size={16} />{children}</span>;
}
