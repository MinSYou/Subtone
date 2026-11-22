import { useMemo, useState } from 'react';
import { checkAffordability } from '../../analytics';
import { parseAmount } from '../../domain/money';
import type { Cadence, TransactionType } from '../../domain/types';
import { LIMITS, parseTags, sanitizeLine, sanitizeMultiline, sanitizeTagInput } from '../../domain/validation';
import { CategoryPicker, FieldLabel, Segmented, Sheet } from '../components/common';
import { Icon } from '../components/Icon';
import { DateField, Select } from '../components/pickers';
import { useMoney, useStore, useStoreState, useToast, useToday } from '../context';
import { play } from '../sound';

const DEFAULT_CAT: Record<TransactionType, string> = { expense: 'groceries', income: 'salary' };

/** Up to 5 example titles per type; one is picked at random each time the sheet opens. */
export const TITLE_PLACEHOLDERS: Record<TransactionType, string[]> = {
  expense: ['e.g. Dinner - Chat Thai', 'e.g. Woolworths groceries', 'e.g. Opal / train fare', 'e.g. Chemist Warehouse', 'e.g. Coffee with Sam'],
  income: ['e.g. Salary', 'e.g. Freelance invoice', 'e.g. Tax refund', 'e.g. Birthday gift', 'e.g. Savings interest'],
};

const REPEAT_OPTIONS: { value: Cadence | 'none'; label: string }[] = [
  { value: 'none', label: 'One-off' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

function useRemovedNote() {
  const [note, setNote] = useState<string | undefined>();
  const flag = (removed: string[]) => setNote(removed.length ? `Removed ${removed.slice(0, 4).join(' ')}` : undefined);
  return [note, flag] as const;
}

export function TransactionSheet({ editId, onClose }: { editId: string | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const money = useMoney();
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
  const [repeat, setRepeat] = useState<Cadence | 'none'>('none');
  const [pick] = useState(() => Math.floor(Math.random() * 5));
  const [titleNote, flagTitle] = useRemovedNote();
  const [tagNote, flagTags] = useRemovedNote();
  const [notesNote, flagNotes] = useRemovedNote();

  const cents = parseAmount(amount);
  const amountInvalid = amount.trim() !== '' && (cents === null || cents === 0);
  const parsedTags = parseTags(tags);
  const placeholder = TITLE_PLACEHOLDERS[type][pick % TITLE_PLACEHOLDERS[type].length];

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
    const fields = {
      type,
      title: sanitizeLine(title, LIMITS.title).value,
      amountCents: cents,
      date,
      categoryId,
      tags: parsedTags.tags,
      notes: sanitizeMultiline(notes, LIMITS.notes).value || undefined,
    };
    if (existing) {
      store.updateTransaction(existing.id, fields);
    } else if (repeat !== 'none') {
      const kind = type === 'income' ? 'income' : categoryId === 'subscriptions' ? 'subscription' : 'bill';
      const r = store.saveRecurring({ title: fields.title || 'Recurring', kind, type, amountCents: cents, categoryId, cadence: repeat, anchorDate: date, status: 'active' });
      // Today's or a past first occurrence is posted now; a future one stays reserved until due.
      if (date <= today) store.addTransaction({ ...fields, recurringId: r.id });
    } else {
      store.addTransaction(fields);
    }
    play('success');
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    const removed = store.deleteTransactions([existing.id]);
    play('delete');
    onClose();
    toast({
      message: 'Transaction deleted',
      actionLabel: 'Undo',
      onAction: () => {
        store.restoreTransactions(removed);
        play('undo');
      },
    });
  };

  const footer = (
    <div className="row">
      {existing && (
        <button className="btn danger" onClick={remove} aria-label="Delete transaction">
          <Icon name="trash" size={18} />
        </button>
      )}
      <button className="btn primary grow" onClick={save} disabled={!cents}>
        {existing ? 'Save changes' : 'Save'}
      </button>
    </div>
  );

  return (
    <Sheet title={existing ? 'Edit transaction' : 'New transaction'} onClose={onClose} footer={footer}>
      <Segmented
        label="Transaction type"
        value={type}
        onChange={(t) => {
          setType(t);
          play('tap');
          if (data.categories.find((c) => c.id === categoryId)?.type !== t) setCategoryId(DEFAULT_CAT[t]);
        }}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
      />
      <div className="amount-row">
        <label htmlFor="txn-amount" className="lbl">
          Amount ({data.settings.currency})
        </label>
        <input
          id="txn-amount"
          className="amount-input num"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          maxLength={12}
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          aria-invalid={amountInvalid}
          style={{ color: type === 'income' ? 'var(--good)' : undefined }}
        />
        {amountInvalid && <span className="small" style={{ color: 'var(--warn)' }}>Enter an amount like 42.50</span>}
      </div>
      <div className="field">
        <FieldLabel htmlFor="txn-title" count={[...title].length} max={LIMITS.title} note={titleNote}>
          Title
        </FieldLabel>
        <input
          id="txn-title"
          className="input"
          value={title}
          maxLength={LIMITS.title}
          placeholder={placeholder}
          onChange={(e) => {
            const r = sanitizeLine(e.target.value, LIMITS.title, true);
            flagTitle(r.removed);
            setTitle(r.value);
          }}
        />
      </div>
      <CategoryPicker type={type} value={categoryId} onChange={setCategoryId} compact />
      {impact && (
        <div className="impact" aria-live="polite">
          <span style={{ color: impact.verdict === 'comfortable' ? 'var(--good)' : 'var(--warn)' }}>
            <Icon name={impact.verdict === 'comfortable' ? 'check' : 'alert'} size={16} />
          </span>
          <span className="small num">
            {impact.headline}
            {impact.safePerDayAfterCents !== null ? ` · ${money(impact.safePerDayAfterCents, { whole: true })}/day after` : ''}
          </span>
        </div>
      )}
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="field grow" style={{ flexBasis: 0, minWidth: 0 }}>
          <span className="lbl">Date</span>
          <DateField value={date} onChange={(d) => setDate(d || today)} today={today} label="Date" />
        </div>
        {!existing && (
          <div className="field grow" style={{ flexBasis: 0, minWidth: 0 }}>
            <span className="lbl">Repeats</span>
            <Select label="Repeats" value={repeat} onChange={setRepeat} options={REPEAT_OPTIONS} />
          </div>
        )}
      </div>
      <div className="pair">
      <div className="field">
        <FieldLabel
          htmlFor="txn-tags"
          count={parsedTags.tags.length}
          max={LIMITS.tagsPerTransaction}
          note={tagNote ?? (parsedTags.dropped ? `Max ${LIMITS.tagsPerTransaction} tags` : undefined)}
        >
          Tags (comma separated)
        </FieldLabel>
        <input
          id="txn-tags"
          className="input"
          value={tags}
          placeholder="work, shared"
          onChange={(e) => {
            const r = sanitizeTagInput(e.target.value);
            flagTags(r.removed);
            setTags(r.value);
          }}
        />
      </div>
      <div className="field">
        <FieldLabel htmlFor="txn-notes" count={[...notes].length} max={LIMITS.notes} note={notesNote}>
          Notes
        </FieldLabel>
        <textarea
          id="txn-notes"
          className="input"
          rows={1}
          value={notes}
          maxLength={LIMITS.notes}
          onChange={(e) => {
            const r = sanitizeMultiline(e.target.value, LIMITS.notes, true);
            flagNotes(r.removed);
            setNotes(r.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
          }}
        />
      </div>
      </div>
    </Sheet>
  );
}
