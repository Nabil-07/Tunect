// src/pages/admin/offers-packs.tsx
import { useEffect, useState, useCallback } from 'react';
import {
  Package, Tag, Percent, Globe, ShieldCheck, Plus, Pencil, Trash2,
  X, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Layers,
} from 'lucide-react';
import {
  adminListFeeBrackets, adminCreateFeeBracket, adminUpdateFeeBracket, adminDeleteFeeBracket,
  adminListTokenPacks, adminCreateTokenPack, adminUpdateTokenPack, adminDeleteTokenPack,
  adminListPackOffers, adminCreatePackOffer, adminUpdatePackOffer, adminDeletePackOffer,
  adminListCoupons, adminCreateCoupon, adminUpdateCoupon, adminDeleteCoupon,
  adminListPackRules, adminCreatePackRule, adminUpdatePackRule, adminDeletePackRule,
  adminListCurrencies, adminCreateCurrency, adminUpdateCurrency, adminDeleteCurrency,
  adminGetOffersStats,
  type FeeBracket, type TokenPack, type PackOffer, type Coupon,
  type PackPurchaseRule, type CurrencyConfig,
} from '../../services/offersService';
import { useToast } from '../../contexts/ToastContext';

type Tab = 'packs' | 'brackets' | 'offers' | 'coupons' | 'rules' | 'currencies';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'packs', label: 'Token Packs', icon: Package },
  { id: 'brackets', label: 'Fee Brackets', icon: Layers },
  { id: 'offers', label: 'Pack Offers', icon: Percent },
  { id: 'coupons', label: 'Coupons', icon: Tag },
  { id: 'rules', label: 'Purchase Rules', icon: ShieldCheck },
  { id: 'currencies', label: 'Currencies', icon: Globe },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Badge({ label, color = 'slate' }: { label: string; color?: string }) {
  const colors: Record<string, string> = {
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    slate: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colors[color] ?? colors.slate}`}>{label}</span>;
}

function ConfirmDelete({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">Sure?</span>
      <button onClick={onConfirm} className="text-xs font-semibold text-red-600 hover:underline">Yes</button>
      <button onClick={onCancel} className="text-xs text-slate-400 hover:underline">No</button>
    </div>
  );
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="focus:outline-none">
      {checked
        ? <ToggleRight className="h-6 w-6 text-emerald-500" />
        : <ToggleLeft className="h-6 w-6 text-slate-300" />}
    </button>
  );
}

// ─── Inline Edit Field ────────────────────────────────────────────────────────

function Field({ label, value, type = 'text', onChange, placeholder }: {
  label: string; value: any; type?: string; onChange: (v: any) => void; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-ocean-400 focus:outline-none focus:ring-1 focus:ring-ocean-400"
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: any; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-ocean-400 focus:outline-none focus:ring-1 focus:ring-ocean-400 bg-white"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ─── Token Packs Tab ──────────────────────────────────────────────────────────

function TokenPacksTab() {
  const { showError } = useToast();
  const [packs, setPacks] = useState<TokenPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; item?: TokenPack } | null>(null);
  const [form, setForm] = useState<Partial<TokenPack>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setPacks(await adminListTokenPacks()); }
    catch (e: any) { showError(e?.response?.data?.message || 'Failed to load packs'); }
    finally { setLoading(false); }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm({ isActive: true, isVisible: true, isHighlighted: false, displayOrder: 0 }); setModal({ mode: 'create' }); };
  const openEdit = (item: TokenPack) => { setForm({ ...item }); setModal({ mode: 'edit', item }); };
  const closeModal = () => { setModal(null); setForm({}); };

  const save = async () => {
    setSaving(true);
    try {
      if (modal?.mode === 'create') await adminCreateTokenPack(form);
      else if (modal?.item) await adminUpdateTokenPack(modal.item.id, form);
      await load();
      closeModal();
    } catch (e: any) {
      showError(e?.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try { await adminDeleteTokenPack(id); await load(); }
    catch (e: any) { showError(e?.response?.data?.message || 'Failed to delete'); }
    finally { setConfirmDelete(null); }
  };

  const toggleActive = async (item: TokenPack) => {
    try { await adminUpdateTokenPack(item.id, { isActive: !item.isActive }); await load(); }
    catch (e: any) { showError(e?.response?.data?.message || 'Failed to update'); }
  };

  if (loading) return <div className="py-8 text-center text-slate-400 text-sm">Loading packs…</div>;

  return (
    <>
      <SectionCard title={`Token Packs (${packs.length})`} action={
        <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-ocean-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-ocean-700">
          <Plus className="h-4 w-4" /> Add Pack
        </button>
      }>
        {packs.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No packs configured. Add your first pack.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {packs.map((pack) => (
              <div key={pack.id} className="flex items-center gap-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-800">{pack.name}</span>
                    <span className="text-xs text-slate-500">{pack.displayLabel}</span>
                    {pack.badgeLabel && <Badge label={pack.badgeLabel} color="blue" />}
                    {pack.isHighlighted && <Badge label="Highlighted" color="amber" />}
                    {!pack.isActive && <Badge label="Inactive" color="red" />}
                    {!pack.isVisible && <Badge label="Hidden" color="slate" />}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {pack.tokenCount} tokens · Order: {pack.displayOrder}
                    {pack.maxPurchaseLimit != null && ` · Max ${pack.maxPurchaseLimit} purchases`}
                  </div>
                </div>
                <ToggleSwitch checked={pack.isActive} onChange={() => toggleActive(pack)} />
                <button onClick={() => openEdit(pack)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
                  <Pencil className="h-4 w-4" />
                </button>
                {confirmDelete === pack.id ? (
                  <ConfirmDelete onConfirm={() => remove(pack.id)} onCancel={() => setConfirmDelete(null)} />
                ) : (
                  <button onClick={() => setConfirmDelete(pack.id)} className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {modal && (
        <Modal title={modal.mode === 'create' ? 'Add Token Pack' : 'Edit Token Pack'} onClose={closeModal}>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Field label="Pack Name *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. Starter Pack" /></div>
            <div className="col-span-2"><Field label="Display Label *" value={form.displayLabel} onChange={(v) => setForm((f) => ({ ...f, displayLabel: v }))} placeholder="e.g. 5 Tokens" /></div>
            <Field label="Token Count *" value={form.tokenCount} type="number" onChange={(v) => setForm((f) => ({ ...f, tokenCount: v }))} placeholder="5" />
            <Field label="Display Order" value={form.displayOrder} type="number" onChange={(v) => setForm((f) => ({ ...f, displayOrder: v }))} />
            <div className="col-span-2"><Field label="Badge Label" value={form.badgeLabel} onChange={(v) => setForm((f) => ({ ...f, badgeLabel: v || null }))} placeholder="e.g. Most Popular, Best Value" /></div>
            <Field label="Max Purchase Limit" value={form.maxPurchaseLimit} type="number" onChange={(v) => setForm((f) => ({ ...f, maxPurchaseLimit: v ?? null }))} placeholder="Leave blank for unlimited" />
          </div>
          <div className="mt-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded" />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!form.isVisible} onChange={(e) => setForm((f) => ({ ...f, isVisible: e.target.checked }))} className="rounded" />
              Visible to Students
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!form.isHighlighted} onChange={(e) => setForm((f) => ({ ...f, isHighlighted: e.target.checked }))} className="rounded" />
              Highlighted (auto-selected)
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={closeModal} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving || !form.name || !form.displayLabel || !form.tokenCount}
              className="rounded-lg bg-ocean-600 px-4 py-2 text-sm font-medium text-white hover:bg-ocean-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Pack'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── Fee Brackets Tab ─────────────────────────────────────────────────────────

function FeeBracketsTab() {
  const { showError } = useToast();
  const [brackets, setBrackets] = useState<FeeBracket[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; item?: FeeBracket } | null>(null);
  const [form, setForm] = useState<Partial<FeeBracket>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setBrackets(await adminListFeeBrackets()); }
    catch (e: any) { showError(e?.response?.data?.message || 'Failed to load brackets'); }
    finally { setLoading(false); }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      if (modal?.mode === 'create') await adminCreateFeeBracket(form);
      else if (modal?.item) await adminUpdateFeeBracket(modal.item.id, form);
      await load();
      setModal(null); setForm({});
    } catch (e: any) { showError(e?.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    try { await adminDeleteFeeBracket(id); await load(); }
    catch (e: any) { showError(e?.response?.data?.message || 'Failed to delete'); }
    finally { setConfirmDelete(null); }
  };

  if (loading) return <div className="py-8 text-center text-slate-400 text-sm">Loading brackets…</div>;

  return (
    <>
      <SectionCard title="Fee Brackets" action={
        <button onClick={() => { setForm({ isActive: true, displayOrder: 0 }); setModal({ mode: 'create' }); }}
          className="flex items-center gap-1.5 rounded-lg bg-ocean-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-ocean-700">
          <Plus className="h-4 w-4" /> Add Bracket
        </button>
      }>
        <div className="mb-3 text-xs text-slate-500">
          Brackets determine platform commission rates based on tutor hourly rate. Set <code>maxRate</code> to blank for unlimited (highest bracket).
        </div>
        {brackets.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No fee brackets configured.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {brackets.map((b) => (
              <div key={b.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{b.name}</span>
                    {!b.isActive && <Badge label="Inactive" color="red" />}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    ₹{Number(b.minRate).toFixed(0)} – {b.maxRate != null ? `₹${Number(b.maxRate).toFixed(0)}` : '∞'} · Commission: {Number(b.commissionPct)}%
                  </div>
                </div>
                <button onClick={() => { setForm({ ...b }); setModal({ mode: 'edit', item: b }); }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
                  <Pencil className="h-4 w-4" />
                </button>
                {confirmDelete === b.id ? (
                  <ConfirmDelete onConfirm={() => remove(b.id)} onCancel={() => setConfirmDelete(null)} />
                ) : (
                  <button onClick={() => setConfirmDelete(b.id)} className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {modal && (
        <Modal title={modal.mode === 'create' ? 'Add Fee Bracket' : 'Edit Fee Bracket'} onClose={() => { setModal(null); setForm({}); }}>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Field label="Bracket Name *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. Bracket 1" /></div>
            <Field label="Min Rate (₹) *" value={form.minRate} type="number" onChange={(v) => setForm((f) => ({ ...f, minRate: v }))} placeholder="0" />
            <Field label="Max Rate (₹)" value={form.maxRate} type="number" onChange={(v) => setForm((f) => ({ ...f, maxRate: v ?? null }))} placeholder="Leave blank for unlimited" />
            <Field label="Commission % *" value={form.commissionPct} type="number" onChange={(v) => setForm((f) => ({ ...f, commissionPct: v }))} placeholder="25" />
            <Field label="Display Order" value={form.displayOrder} type="number" onChange={(v) => setForm((f) => ({ ...f, displayOrder: v }))} />
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded" />
              Active
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => { setModal(null); setForm({}); }} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving || !form.name || form.minRate == null || form.commissionPct == null}
              className="rounded-lg bg-ocean-600 px-4 py-2 text-sm font-medium text-white hover:bg-ocean-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Bracket'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── Pack Offers Tab ──────────────────────────────────────────────────────────

function PackOffersTab() {
  const { showError } = useToast();
  const [offers, setOffers] = useState<PackOffer[]>([]);
  const [packs, setPacks] = useState<TokenPack[]>([]);
  const [brackets, setBrackets] = useState<FeeBracket[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; item?: PackOffer } | null>(null);
  const [form, setForm] = useState<Partial<PackOffer>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, p, b] = await Promise.all([adminListPackOffers(), adminListTokenPacks(), adminListFeeBrackets()]);
      setOffers(o); setPacks(p); setBrackets(b);
    } catch (e: any) { showError(e?.response?.data?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      if (modal?.mode === 'create') await adminCreatePackOffer(form);
      else if (modal?.item) await adminUpdatePackOffer(modal.item.id, form);
      await load(); setModal(null); setForm({});
    } catch (e: any) { showError(e?.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    try { await adminDeletePackOffer(id); await load(); }
    catch (e: any) { showError(e?.response?.data?.message || 'Failed to delete'); }
    finally { setConfirmDelete(null); }
  };

  const toggleActive = async (item: PackOffer) => {
    try { await adminUpdatePackOffer(item.id, { isActive: !item.isActive }); await load(); }
    catch (e: any) { showError(e?.response?.data?.message || 'Failed to update'); }
  };

  if (loading) return <div className="py-8 text-center text-slate-400 text-sm">Loading offers…</div>;

  return (
    <>
      <SectionCard title="Pack Offers / Discounts" action={
        <button onClick={() => { setForm({ isActive: true, discountType: 'FIXED_AMOUNT' }); setModal({ mode: 'create' }); }}
          className="flex items-center gap-1.5 rounded-lg bg-ocean-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-ocean-700">
          <Plus className="h-4 w-4" /> Add Offer
        </button>
      }>
        <div className="mb-3 text-xs text-slate-500">
          Configure discounts per bracket × pack combination. Only one offer per bracket/pack pair is active at a time.
        </div>
        {offers.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No pack offers configured.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {offers.map((o) => (
              <div key={o.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-800">{o.pack?.displayLabel ?? o.packId}</span>
                    <span className="text-xs text-slate-500">×</span>
                    <span className="text-sm text-slate-600">{o.bracket?.name ?? o.bracketId}</span>
                    {!o.isActive && <Badge label="Inactive" color="red" />}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {o.discountType === 'FIXED_AMOUNT' ? `₹${Number(o.discountValue).toFixed(0)} off` : `${Number(o.discountValue)}% off`}
                    {o.discountCap != null && ` (cap ₹${Number(o.discountCap).toFixed(0)})`}
                    {o.startDate && ` · From ${new Date(o.startDate).toLocaleDateString()}`}
                    {o.endDate && ` to ${new Date(o.endDate).toLocaleDateString()}`}
                  </div>
                </div>
                <ToggleSwitch checked={o.isActive} onChange={() => toggleActive(o)} />
                <button onClick={() => { setForm({ ...o }); setModal({ mode: 'edit', item: o }); }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
                  <Pencil className="h-4 w-4" />
                </button>
                {confirmDelete === o.id ? (
                  <ConfirmDelete onConfirm={() => remove(o.id)} onCancel={() => setConfirmDelete(null)} />
                ) : (
                  <button onClick={() => setConfirmDelete(o.id)} className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {modal && (
        <Modal title={modal.mode === 'create' ? 'Add Pack Offer' : 'Edit Pack Offer'} onClose={() => { setModal(null); setForm({}); }}>
          <div className="grid grid-cols-2 gap-4">
            <SelectField label="Token Pack *" value={form.packId} onChange={(v) => setForm((f) => ({ ...f, packId: v }))}
              options={[{ value: '', label: '— Select Pack —' }, ...packs.map((p) => ({ value: p.id, label: p.displayLabel }))]} />
            <SelectField label="Fee Bracket *" value={form.bracketId} onChange={(v) => setForm((f) => ({ ...f, bracketId: v }))}
              options={[{ value: '', label: '— Select Bracket —' }, ...brackets.map((b) => ({ value: b.id, label: b.name }))]} />
            <SelectField label="Discount Type *" value={form.discountType} onChange={(v) => setForm((f) => ({ ...f, discountType: v as any }))}
              options={[{ value: 'FIXED_AMOUNT', label: 'Flat Amount (₹)' }, { value: 'PERCENTAGE', label: 'Percentage (%)' }]} />
            <Field label={form.discountType === 'PERCENTAGE' ? 'Discount %' : 'Discount Amount (₹)'} value={form.discountValue} type="number"
              onChange={(v) => setForm((f) => ({ ...f, discountValue: v }))} placeholder="0" />
            <Field label="Discount Cap (₹)" value={form.discountCap} type="number"
              onChange={(v) => setForm((f) => ({ ...f, discountCap: v ?? null }))} placeholder="Optional max discount" />
            <div />
            <Field label="Start Date" value={form.startDate ? form.startDate.slice(0, 10) : ''} type="date"
              onChange={(v) => setForm((f) => ({ ...f, startDate: v || null }))} />
            <Field label="End Date" value={form.endDate ? form.endDate.slice(0, 10) : ''} type="date"
              onChange={(v) => setForm((f) => ({ ...f, endDate: v || null }))} />
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded" />
              Active
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => { setModal(null); setForm({}); }} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving || !form.packId || !form.bracketId || form.discountValue == null}
              className="rounded-lg bg-ocean-600 px-4 py-2 text-sm font-medium text-white hover:bg-ocean-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Offer'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── Coupons Tab ──────────────────────────────────────────────────────────────

function CouponsTab() {
  const { showError } = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [packs, setPacks] = useState<TokenPack[]>([]);
  const [brackets, setBrackets] = useState<FeeBracket[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; item?: Coupon } | null>(null);
  const [form, setForm] = useState<Partial<Coupon> & { applicableBracketIds?: string[]; applicablePackIds?: string[] }>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [res, p, b] = await Promise.all([adminListCoupons(page, 20), adminListTokenPacks(), adminListFeeBrackets()]);
      setCoupons(res.items); setTotal(res.total); setPacks(p); setBrackets(b);
    } catch (e: any) { showError(e?.response?.data?.message || 'Failed to load coupons'); }
    finally { setLoading(false); }
  }, [showError, page]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm({ isActive: true, discountType: 'FIXED_AMOUNT', usageFrequency: 'ONE_TIME', applicableBracketIds: [], applicablePackIds: [] });
    setModal({ mode: 'create' });
  };

  const openEdit = (item: Coupon) => {
    setForm({
      ...item,
      applicableBracketIds: item.couponBrackets?.map((cb) => cb.bracketId) ?? [],
      applicablePackIds: item.couponPacks?.map((cp) => cp.packId) ?? [],
    });
    setModal({ mode: 'edit', item });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (modal?.mode === 'create') await adminCreateCoupon(payload);
      else if (modal?.item) await adminUpdateCoupon(modal.item.id, payload);
      await load(); setModal(null); setForm({});
    } catch (e: any) { showError(e?.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    try { await adminDeleteCoupon(id); await load(); }
    catch (e: any) { showError(e?.response?.data?.message || 'Failed to delete'); }
    finally { setConfirmDelete(null); }
  };

  const toggleBracket = (id: string) => {
    setForm((f) => {
      const cur = f.applicableBracketIds ?? [];
      return { ...f, applicableBracketIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  };

  const togglePack = (id: string) => {
    setForm((f) => {
      const cur = f.applicablePackIds ?? [];
      return { ...f, applicablePackIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  };

  if (loading) return <div className="py-8 text-center text-slate-400 text-sm">Loading coupons…</div>;

  return (
    <>
      <SectionCard title={`Coupons (${total})`} action={
        <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-ocean-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-ocean-700">
          <Plus className="h-4 w-4" /> Add Coupon
        </button>
      }>
        {coupons.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No coupons configured.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {coupons.map((c) => (
              <div key={c.id}>
                <div className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-slate-800 text-sm">{c.code}</span>
                      {c.isActive ? <Badge label="Active" color="green" /> : <Badge label="Inactive" color="red" />}
                      <Badge label={c.usageFrequency.replace(/_/g, ' ')} />
                      {c._count && <span className="text-xs text-slate-400">{c._count.usages} uses</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {c.discountType === 'FIXED_AMOUNT' ? `₹${Number(c.discountValue).toFixed(0)} off` : `${Number(c.discountValue)}% off`}
                      {c.discountCap != null && ` (cap ₹${Number(c.discountCap).toFixed(0)})`}
                      {c.minCartValue != null && ` · Min cart ₹${Number(c.minCartValue).toFixed(0)}`}
                      {c.totalRedemptionLimit != null && ` · Limit: ${c.usedCount}/${c.totalRedemptionLimit}`}
                    </div>
                    {c.description && <div className="text-xs text-slate-500 mt-0.5">{c.description}</div>}
                  </div>
                  <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="p-1 text-slate-400 hover:text-slate-600">
                    {expanded === c.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <button onClick={() => openEdit(c)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
                    <Pencil className="h-4 w-4" />
                  </button>
                  {confirmDelete === c.id ? (
                    <ConfirmDelete onConfirm={() => remove(c.id)} onCancel={() => setConfirmDelete(null)} />
                  ) : (
                    <button onClick={() => setConfirmDelete(c.id)} className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {expanded === c.id && (
                  <div className="pb-3 pl-2 text-xs text-slate-500 grid grid-cols-2 gap-1">
                    <span>Per-user limit: {c.perUserLimit ?? 'Unlimited'}</span>
                    <span>Custom limit: {c.customUsageLimit ?? '—'}</span>
                    {c.startDate && <span>From: {new Date(c.startDate).toLocaleDateString()}</span>}
                    {c.endDate && <span>Until: {new Date(c.endDate).toLocaleDateString()}</span>}
                    {(c.couponBrackets?.length ?? 0) > 0 && (
                      <span className="col-span-2">Brackets: {c.couponBrackets?.map((cb) => cb.bracket?.name).join(', ')}</span>
                    )}
                    {(c.couponPacks?.length ?? 0) > 0 && (
                      <span className="col-span-2">Packs: {c.couponPacks?.map((cp) => cp.pack?.displayLabel).join(', ')}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {total > 20 && (
          <div className="mt-4 flex justify-center gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border px-3 py-1 text-sm disabled:opacity-40">Prev</button>
            <span className="text-sm text-slate-500 self-center">Page {page} of {Math.ceil(total / 20)}</span>
            <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage((p) => p + 1)} className="rounded-lg border px-3 py-1 text-sm disabled:opacity-40">Next</button>
          </div>
        )}
      </SectionCard>

      {modal && (
        <Modal title={modal.mode === 'create' ? 'Add Coupon' : 'Edit Coupon'} onClose={() => { setModal(null); setForm({}); }}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Field label="Coupon Code *" value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))} placeholder="e.g. TUNECTFIRST" /></div>
              <div className="col-span-2"><Field label="Description" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v || null }))} placeholder="Internal description" /></div>
              <SelectField label="Discount Type *" value={form.discountType} onChange={(v) => setForm((f) => ({ ...f, discountType: v as any }))}
                options={[{ value: 'FIXED_AMOUNT', label: 'Flat Amount (₹)' }, { value: 'PERCENTAGE', label: 'Percentage (%)' }]} />
              <Field label={form.discountType === 'PERCENTAGE' ? 'Discount %' : 'Discount Amount (₹)'} value={form.discountValue} type="number"
                onChange={(v) => setForm((f) => ({ ...f, discountValue: v }))} placeholder="0" />
              <Field label="Discount Cap (₹)" value={form.discountCap} type="number"
                onChange={(v) => setForm((f) => ({ ...f, discountCap: v ?? null }))} placeholder="Optional" />
              <Field label="Min Cart Value (₹)" value={form.minCartValue} type="number"
                onChange={(v) => setForm((f) => ({ ...f, minCartValue: v ?? null }))} placeholder="Optional" />
              <Field label="Start Date" value={form.startDate ? form.startDate.slice(0, 10) : ''} type="date"
                onChange={(v) => setForm((f) => ({ ...f, startDate: v || null }))} />
              <Field label="End Date" value={form.endDate ? form.endDate.slice(0, 10) : ''} type="date"
                onChange={(v) => setForm((f) => ({ ...f, endDate: v || null }))} />
              <SelectField label="Usage Frequency" value={form.usageFrequency} onChange={(v) => setForm((f) => ({ ...f, usageFrequency: v as any }))}
                options={[
                  { value: 'ONE_TIME', label: 'One-time per user' },
                  { value: 'ONCE_PER_MONTH', label: 'Once per month' },
                  { value: 'ONCE_PER_QUARTER', label: 'Once per quarter' },
                  { value: 'ONCE_PER_YEAR', label: 'Once per year' },
                  { value: 'UNLIMITED', label: 'Unlimited' },
                  { value: 'CUSTOM', label: 'Custom limit' },
                ]} />
              {form.usageFrequency === 'CUSTOM' && (
                <Field label="Custom Limit (uses per user)" value={form.customUsageLimit} type="number"
                  onChange={(v) => setForm((f) => ({ ...f, customUsageLimit: v ?? null }))} placeholder="e.g. 3" />
              )}
              <Field label="Total Redemption Limit" value={form.totalRedemptionLimit} type="number"
                onChange={(v) => setForm((f) => ({ ...f, totalRedemptionLimit: v ?? null }))} placeholder="Global cap (optional)" />
              <Field label="Per-User Redemption Limit" value={form.perUserLimit} type="number"
                onChange={(v) => setForm((f) => ({ ...f, perUserLimit: v ?? null }))} placeholder="Optional" />
            </div>

            {/* Bracket restrictions */}
            {brackets.length > 0 && (
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1.5">Applicable Brackets (leave blank for all)</div>
                <div className="flex flex-wrap gap-2">
                  {brackets.map((b) => (
                    <label key={b.id} className="flex items-center gap-1.5 text-xs cursor-pointer rounded-lg border px-2 py-1 hover:bg-slate-50">
                      <input type="checkbox" checked={(form.applicableBracketIds ?? []).includes(b.id)} onChange={() => toggleBracket(b.id)} className="rounded" />
                      {b.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Pack restrictions */}
            {packs.length > 0 && (
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1.5">Applicable Packs (leave blank for all)</div>
                <div className="flex flex-wrap gap-2">
                  {packs.map((p) => (
                    <label key={p.id} className="flex items-center gap-1.5 text-xs cursor-pointer rounded-lg border px-2 py-1 hover:bg-slate-50">
                      <input type="checkbox" checked={(form.applicablePackIds ?? []).includes(p.id)} onChange={() => togglePack(p.id)} className="rounded" />
                      {p.displayLabel}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded" />
              Active
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => { setModal(null); setForm({}); }} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving || !form.code || form.discountValue == null}
              className="rounded-lg bg-ocean-600 px-4 py-2 text-sm font-medium text-white hover:bg-ocean-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Coupon'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── Purchase Rules Tab ───────────────────────────────────────────────────────

function PurchaseRulesTab() {
  const { showError } = useToast();
  const [rules, setRules] = useState<PackPurchaseRule[]>([]);
  const [packs, setPacks] = useState<TokenPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; item?: PackPurchaseRule } | null>(null);
  const [form, setForm] = useState<Partial<PackPurchaseRule>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([adminListPackRules(), adminListTokenPacks()]);
      setRules(r); setPacks(p);
    } catch (e: any) { showError(e?.response?.data?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      if (modal?.mode === 'create') await adminCreatePackRule(form);
      else if (modal?.item) await adminUpdatePackRule(modal.item.id, form);
      await load(); setModal(null); setForm({});
    } catch (e: any) { showError(e?.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    try { await adminDeletePackRule(id); await load(); }
    catch (e: any) { showError(e?.response?.data?.message || 'Failed to delete'); }
    finally { setConfirmDelete(null); }
  };

  if (loading) return <div className="py-8 text-center text-slate-400 text-sm">Loading rules…</div>;

  return (
    <>
      <SectionCard title="Pack Purchase Rules" action={
        <button onClick={() => { setForm({ isActive: true, ruleType: 'ONE_PER_CALENDAR_MONTH' }); setModal({ mode: 'create' }); }}
          className="flex items-center gap-1.5 rounded-lg bg-ocean-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-ocean-700">
          <Plus className="h-4 w-4" /> Add Rule
        </button>
      }>
        {rules.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No purchase rules configured.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-800 text-sm">{r.description}</span>
                    <Badge label={r.ruleType.replace(/_/g, ' ')} color="blue" />
                    {!r.isActive && <Badge label="Inactive" color="red" />}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Pack: {r.pack?.displayLabel ?? 'All Packs'}
                    {r.value != null && ` · Limit: ${r.value}`}
                    {r.periodDays != null && ` · Period: ${r.periodDays} days`}
                  </div>
                </div>
                <button onClick={() => { setForm({ ...r }); setModal({ mode: 'edit', item: r }); }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
                  <Pencil className="h-4 w-4" />
                </button>
                {confirmDelete === r.id ? (
                  <ConfirmDelete onConfirm={() => remove(r.id)} onCancel={() => setConfirmDelete(null)} />
                ) : (
                  <button onClick={() => setConfirmDelete(r.id)} className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {modal && (
        <Modal title={modal.mode === 'create' ? 'Add Purchase Rule' : 'Edit Purchase Rule'} onClose={() => { setModal(null); setForm({}); }}>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Field label="Rule Description *" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="e.g. One Monthly Pack per month" /></div>
            <SelectField label="Rule Type *" value={form.ruleType} onChange={(v) => setForm((f) => ({ ...f, ruleType: v as any }))}
              options={[
                { value: 'MAX_PURCHASES_PER_PERIOD', label: 'Max Purchases Per Period' },
                { value: 'ONE_PER_CALENDAR_MONTH', label: 'One Per Calendar Month' },
                { value: 'ONE_DISCOUNTED_AT_A_TIME', label: 'One Discounted At A Time' },
                { value: 'ALLOW_MULTIPLE', label: 'Allow Multiple' },
                { value: 'RESTRICT_DUPLICATE', label: 'Restrict Duplicate' },
              ]} />
            <SelectField label="Applies to Pack" value={form.packId ?? ''} onChange={(v) => setForm((f) => ({ ...f, packId: v || null }))}
              options={[{ value: '', label: 'All Packs' }, ...packs.map((p) => ({ value: p.id, label: p.displayLabel }))]} />
            <Field label="Value / Limit" value={form.value} type="number" onChange={(v) => setForm((f) => ({ ...f, value: v ?? null }))} placeholder="Optional" />
            <Field label="Period (days)" value={form.periodDays} type="number" onChange={(v) => setForm((f) => ({ ...f, periodDays: v ?? null }))} placeholder="e.g. 30 for monthly" />
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded" />
              Active
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => { setModal(null); setForm({}); }} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving || !form.description || !form.ruleType}
              className="rounded-lg bg-ocean-600 px-4 py-2 text-sm font-medium text-white hover:bg-ocean-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Rule'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── Currencies Tab ───────────────────────────────────────────────────────────

function CurrenciesTab() {
  const { showError } = useToast();
  const [currencies, setCurrencies] = useState<(CurrencyConfig & { id?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; item?: any } | null>(null);
  const [form, setForm] = useState<Partial<CurrencyConfig & { id?: string }>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setCurrencies(await adminListCurrencies()); }
    catch (e: any) { showError(e?.response?.data?.message || 'Failed to load currencies'); }
    finally { setLoading(false); }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const { id, ...rest } = form as any;
      if (modal?.mode === 'create') await adminCreateCurrency(rest);
      else if (modal?.item?.id) await adminUpdateCurrency(modal.item.id, rest);
      await load(); setModal(null); setForm({});
    } catch (e: any) { showError(e?.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    try { await adminDeleteCurrency(id); await load(); }
    catch (e: any) { showError(e?.response?.data?.message || 'Failed to delete'); }
    finally { setConfirmDelete(null); }
  };

  if (loading) return <div className="py-8 text-center text-slate-400 text-sm">Loading currencies…</div>;

  return (
    <>
      <SectionCard title="Currency Configuration" action={
        <button onClick={() => { setForm({ isActive: true, isDefault: false }); setModal({ mode: 'create' }); }}
          className="flex items-center gap-1.5 rounded-lg bg-ocean-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-ocean-700">
          <Plus className="h-4 w-4" /> Add Currency
        </button>
      }>
        <div className="mb-3 text-xs text-slate-500">
          Exchange rates are relative to INR (base currency). INR = 1.0. Example: 1 AED = 23 INR → rate = 23.
        </div>
        {currencies.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No currencies configured.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {currencies.map((c: any) => (
              <div key={c.id ?? c.code} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-slate-800">{c.code}</span>
                    <span className="text-sm text-slate-600">{c.symbol} · {c.name}</span>
                    {c.isDefault && <Badge label="Default" color="green" />}
                    {!c.isActive && <Badge label="Inactive" color="red" />}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">1 {c.code} = ₹{Number(c.exchangeRate).toFixed(4)}</div>
                </div>
                <button onClick={() => { setForm({ ...c }); setModal({ mode: 'edit', item: c }); }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
                  <Pencil className="h-4 w-4" />
                </button>
                {confirmDelete === (c.id ?? c.code) ? (
                  <ConfirmDelete onConfirm={() => remove(c.id ?? c.code)} onCancel={() => setConfirmDelete(null)} />
                ) : (
                  <button onClick={() => setConfirmDelete(c.id ?? c.code)} className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {modal && (
        <Modal title={modal.mode === 'create' ? 'Add Currency' : 'Edit Currency'} onClose={() => { setModal(null); setForm({}); }}>
          <div className="grid grid-cols-2 gap-4">
            {modal.mode === 'create' && (
              <div className="col-span-2"><Field label="Currency Code *" value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))} placeholder="e.g. USD, AED, EUR" /></div>
            )}
            <Field label="Symbol *" value={form.symbol} onChange={(v) => setForm((f) => ({ ...f, symbol: v }))} placeholder="e.g. $, AED, €" />
            <div><Field label="Name *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. US Dollar" /></div>
            <div className="col-span-2">
              <Field label="Exchange Rate (1 unit = X INR) *" value={form.exchangeRate} type="number"
                onChange={(v) => setForm((f) => ({ ...f, exchangeRate: v }))} placeholder="e.g. 23 for AED, 84 for USD" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded" />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} className="rounded" />
              Set as Default
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => { setModal(null); setForm({}); }} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving || (!form.code && modal?.mode === 'create') || !form.symbol || !form.name || form.exchangeRate == null}
              className="rounded-lg bg-ocean-600 px-4 py-2 text-sm font-medium text-white hover:bg-ocean-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Currency'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OffersPacksAdmin() {
  const [activeTab, setActiveTab] = useState<Tab>('packs');
  const [stats, setStats] = useState<{ activePacks: number; activeBrackets: number; activeCoupons: number; activeCurrencies: number } | null>(null);

  useEffect(() => {
    adminGetOffersStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="space-y-6" data-testid="offers-packs-admin-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Offers &amp; Packs</h1>
        <p className="text-slate-500 mt-1 text-sm">Manage token packs, fee brackets, offers, coupons, purchase rules, and currency configuration</p>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Active Packs', value: stats.activePacks, color: 'bg-blue-50 text-blue-700' },
            { label: 'Fee Brackets', value: stats.activeBrackets, color: 'bg-purple-50 text-purple-700' },
            { label: 'Active Coupons', value: stats.activeCoupons, color: 'bg-emerald-50 text-emerald-700' },
            { label: 'Currencies', value: stats.activeCurrencies, color: 'bg-amber-50 text-amber-700' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.color}`}>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs mt-0.5 opacity-80">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex overflow-x-auto gap-1 -mb-px">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-ocean-600 text-ocean-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'packs' && <TokenPacksTab />}
        {activeTab === 'brackets' && <FeeBracketsTab />}
        {activeTab === 'offers' && <PackOffersTab />}
        {activeTab === 'coupons' && <CouponsTab />}
        {activeTab === 'rules' && <PurchaseRulesTab />}
        {activeTab === 'currencies' && <CurrenciesTab />}
      </div>
    </div>
  );
}
