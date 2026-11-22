import { useMemo, useState } from 'react';
import { checkAffordability } from '../../analytics';
import { parseAmount } from '../../domain/money';
import type { Cadence, TransactionType } from '../../domain/types';
import { CategoryPicker, Segmented, Sheet } from '../components/common';
import { Icon } from '../components/Icon';
import { useStore, useStoreState, useToday } from '../context';

const DEFAULT_CAT: Record<TransactionType, string> = { expense: 'groceries', income: 'salary' };

export function TransactionSheet({ editId, onClose }: { editId: string | null; onClose: () => void }) {
  const store = useStore();
  const { data } = useStoreState();
  const today = useToday();
  const existing = editId ? data.transactions.find((t) => t.id === editId) : undefined;

  const [type, setType] = useState<TransactionType>(existing?.type ?? 'expense');
  const [amount, setAmount] = useState(existing ? (existing.amountCents / 100).toFixed(2) : '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? DEFAULT_CAT.expense);
  const [date, setDate] = useState(existing?.date ?? today);
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [repeat, setRepeat] = useState<Cadence | ''>('');
  const cents = parseAmount(amount);
  const amountInvalid = amount.trim() !== '' && (cents === null || cents === 0);

  const impact = useMemo(() => {
    if (existing || type !== 'expense' || !cents) return null;
    try {
      return checkAffordability(data, { amountCents: cents, categoryId, date }, today);
    } catch {
      return null;
    }
  }, [existing, type, cents, categoryId, date, data, today]);

  const save = () => {
    if (!cents) return;
    const cleanTags = tags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
    const fields = { type, title: title.trim(), amountCents: cents, date, categoryId, tags: cleanTags, notes: notes.trim() || undefined };
    if (existing) {
      store.updateTransaction(existing.id, fields);
    } else if (repeat) {
      const kind = type === 'income' ? 'income' : categoryId === 'subscriptions' ? 'subscription' : 'bill';
      const r = store.saveRecurring({ title: fields.title || 'Recurring', kind, type, amountCents: cents, categoryId, cadence: repeat, anchorDate: date, status: 'active' });
      // Today's/past occurrence is posted now; a future first date stays reserved until it's due.
      if (date <= today) store.addTransaction({ ...fields, recurringId: r.id });
    } else {
      store.addTransaction(fields);
    }
    onClose();
  };

  return (
    <Sheet title={existing ? 'Edit transaction' : 'New transaction'} onClose={onClose}>
      <Segmented
        label="Transaction type"
        value={type}
        onChange={(t) => {
          setType(t);
          if (data.categories.find((c) => c.id === categoryId)?.type !== t) setCategoryId(DEFAULT_CAT[t]);
        }}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
      />
      <label className="field" style={{ justifyItems: 'center' }}>
        <span className="lbl">Amount ({data.settings.currency})</span>
        <input
          className="amount-input num"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={amountInvalid}
          style={{ color: type === 'income' ? 'var(--good)' : undefined }}
        />
        {amountInvalid && <span className="small" style={{ color: 'var(--warn)' }}>Enter an amount like 42.50</span>}
      </label>
      <label className="field">
        <span className="lbl">Title</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'expense' ? 'e.g. Dinner — Chat Thai' : 'e.g. Freelance invoice'} />
      </label>
      <CategoryPicker type={type} value={categoryId} onChange={setCategoryId} />
      {impact && (
        <div className="row" style={{ alignItems: 'flex-start', background: 'var(--ground)', borderRadius: 12, padding: 10 }} aria-live="polite">
          <span style={{ color: impact.verdict === 'comfortable' ? 'var(--good)' : 'var(--warn)' }}>
            <Icon name={impact.verdict === 'comfortable' ? 'check' : 'alert'} size={18} />
          </span>
          <span className="small num" style={{ color: '#3a3d44' }}>
            {impact.headline}. {impact.advice}
          </span>
        </div>
      )}
      <div className="row">
        <label className="field grow">
          <span className="lbl">Date</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || today)} />
        </label>
        {!existing && (
          <label className="field grow">
            <span className="lbl">Repeats</span>
            <select className="input" value={repeat} onChange={(e) => setRepeat(e.target.value as Cadence | '')}>
              <option value="">One-off</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
        )}
      </div>
      <label className="field">
        <span className="lbl">Tags (comma separated)</span>
        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="work, shared" />
      </label>
      <label className="field">
        <span className="lbl">Notes</span>
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>


      <div className="row">
        {existing && (
          <button
            className="btn danger"
            onClick={() => {
              if (window.confirm('Delete this transaction?')) {
                store.deleteTransactions([existing.id]);
                onClose();
              }
            }}
          >
            <Icon name="trash" size={18} />
            <span className="sr-only">Delete</span>
          </button>
        )}
        <button className="btn primary grow" onClick={save} disabled={!cents}>
          {existing ? 'Save changes' : 'Save'}
        </button>
      </div>
    </Sheet>
  );
}
