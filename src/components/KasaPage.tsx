import React, { useState, useEffect } from 'react';
import { PlusCircle, TrendingUp, TrendingDown, Wallet, X, Save, Trash2, Calendar, Clock, Check, HandCoins, Undo2 } from 'lucide-react';
import { broadcastNotification } from '../lib/broadcast';
import { db } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, updateDoc, getDocs, where } from 'firebase/firestore';

interface KasaEntry {
    id: string;
    type: 'income' | 'expense' | 'pending' | 'loan' | 'waiting_approval';
    amount: number;
    description?: string;
    orderTitle?: string;
    customer?: string;
    orderId?: string;
    category?: string;
    borrower?: string;
    loanType?: 'receivable' | 'payable';
    originalType?: 'income' | 'expense';
    status?: 'pending' | 'approved';
    createdAt: string;
}

const expenseCategories = [
    'Filament',
    'Elektrik',
    'Bakım & Onarım',
    'Kargo',
    'Ekipman',
    'Diğer'
];

type DatePreset = 'all' | 'today' | 'week' | 'month' | 'custom';

interface KasaPageProps {
    onAddExpense: () => void;
    onOpenPending: () => void;
    onOpenBorrows: (defaultType?: 'receivable' | 'payable') => void;
    setGlobalConfirmDialog: (dialog: { message: string, onConfirm: () => void, confirmVariant?: 'danger' | 'primary', confirmText?: string, cancelText?: string } | null) => void;
    kasaSorumlusu: any;
    currentUserUid: string;
}

export default function KasaPage({ onAddExpense, onOpenPending, onOpenBorrows, setGlobalConfirmDialog, kasaSorumlusu, currentUserUid }: KasaPageProps) {
    const [entries, setEntries] = useState<KasaEntry[]>([]);
    const [filter, setFilter] = useState<'all' | 'income' | 'expense' | 'waiting_approval'>('all');
    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'kasa'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            })) as KasaEntry[];
            setEntries(data);
        });
        return () => unsubscribe();
    }, []);

    const handleDelete = (entry: KasaEntry) => {
        if (kasaSorumlusu && currentUserUid !== kasaSorumlusu.uid) {
            alert('Sadece kasa sorumlusu kayıt silebilir.');
            return;
        }

        if (entry.type === 'income' && entry.orderId) {
             // Check if order is accountingized (we can infer it if it was from approval system)
             // But for safety, let's just show a warning if it's a confirmed income with orderId
             setGlobalConfirmDialog({
                message: 'Bu kayıt bir sipariş teslimatı ile ilişkili. Silmek yerine sipariş üzerinden işlem yapmanız önerilir. Yine de silmek istiyor musunuz?',
                confirmVariant: 'danger',
                confirmText: 'Yine de Sil',
                onConfirm: async () => {
                    try { await deleteDoc(doc(db, 'kasa', entry.id)); } catch (e) { console.error(e); }
                    setGlobalConfirmDialog(null);
                }
            });
            return;
        }

        setGlobalConfirmDialog({
            message: 'Bu kaydı silmek istediğinize emin misiniz?',
            confirmVariant: 'danger',
            confirmText: 'Sil',
            onConfirm: async () => {
                try { await deleteDoc(doc(db, 'kasa', entry.id)); } catch (e) { console.error(e); }
                setGlobalConfirmDialog(null);
            }
        });
    };

    const handleApprove = async (entry: KasaEntry) => {
        if (kasaSorumlusu && currentUserUid !== kasaSorumlusu.uid) {
            alert('Sadece kasa sorumlusu onay verebilir.');
            return;
        }
        try {
            const isLoan = !!(entry as any).loanType;
            const finalType = isLoan ? 'loan' : ((entry as any).originalType || 'income');
            
            // Update kasa entry
            await updateDoc(doc(db, 'kasa', entry.id), {
                type: finalType,
                status: 'approved',
                approvedAt: new Date().toISOString()
            });

            // Mark order as accountingized
            if (entry.orderId) {
                await updateDoc(doc(db, 'orders', entry.orderId), {
                    isAccountingized: true
                });
            }

            // GLOBAL BROADCAST: Notify all users
            broadcastNotification(finalType === 'income' ? 'Gelir Kesinleşti' : 'Gider Kesinleşti', `${entry.amount}₺ tutarındaki işlem onaylandı: ${entry.orderTitle || entry.description || entry.category}`);

        } catch (error) {
            console.error('Approval error:', error);
            alert('Onaylama sırasında bir hata oluştu.');
        }
    };


    const handleReject = async (entry: KasaEntry) => {
        if (kasaSorumlusu && currentUserUid !== kasaSorumlusu.uid) {
            alert('Sadece kasa sorumlusu işlem yapabilir.');
            return;
        }
        setGlobalConfirmDialog({
            message: 'Bu ödeme isteğini reddetmek istediğinize emin misiniz? Kayıt tamamen silinecektir.',
            confirmVariant: 'danger',
            confirmText: 'Reddet ve Sil',
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, 'kasa', entry.id));
                } catch (e) { console.error(e); }
                setGlobalConfirmDialog(null);
            }
        });
    };

    // Date filtering
    const getDateRange = (): { start: Date | null; end: Date | null } => {
        const now = new Date();
        switch (datePreset) {
            case 'today': {
                const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                return { start: s, end: e };
            }
            case 'week': {
                const s = new Date(now); s.setDate(now.getDate() - 7); s.setHours(0, 0, 0, 0);
                return { start: s, end: now };
            }
            case 'month': {
                return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
            }
            case 'custom': {
                return {
                    start: startDate ? new Date(startDate + 'T00:00:00') : null,
                    end: endDate ? new Date(endDate + 'T23:59:59') : null
                };
            }
            default: return { start: null, end: null };
        }
    };

    const dateRange = getDateRange();
    const pendingEntries = entries.filter(e => e.type === 'pending');
    const waitingApprovals = entries.filter(e => e.type === 'waiting_approval');
    const loanEntries = entries.filter(e => e.type === 'loan' || (e.type === 'waiting_approval' && (e as any).loanType));
    const transactionEntries = entries.filter(e => 
        (e.type === 'income' || e.type === 'expense' || (e.type === 'loan' && e.status === 'approved'))
    );

    const dateFilteredTransactions = transactionEntries.filter(e => {
        if (!dateRange.start && !dateRange.end) return true;
        const entryDate = new Date(e.createdAt);
        if (dateRange.start && entryDate < dateRange.start) return false;
        if (dateRange.end && entryDate > dateRange.end) return false;
        return true;
    });

    const dateFilteredApprovals = waitingApprovals.filter(e => {
        if (!dateRange.start && !dateRange.end) return true;
        const entryDate = new Date(e.createdAt);
        if (dateRange.start && entryDate < dateRange.start) return false;
        if (dateRange.end && entryDate > dateRange.end) return false;
        return true;
    });

    const filteredEntries = filter === 'waiting_approval' 
        ? dateFilteredApprovals 
        : dateFilteredTransactions.filter(e => filter === 'all' || e.type === filter);

    const totalIncome = dateFilteredTransactions.filter(e => e.type === 'income' || (e.type === 'loan' && e.loanType === 'payable')).reduce((sum, e) => sum + e.amount, 0);
    const totalExpense = dateFilteredTransactions.filter(e => e.type === 'expense' || (e.type === 'loan' && e.loanType === 'receivable' || (e.type === 'loan' && !e.loanType))).reduce((sum, e) => sum + e.amount, 0);
    const netBalance = totalIncome - totalExpense;
    
    const totalPending = pendingEntries.reduce((sum, e) => sum + e.amount, 0);
    const totalReceivables = loanEntries.filter(e => e.loanType === 'receivable' || !e.loanType).reduce((sum, e) => sum + e.amount, 0);
    const totalPayables = loanEntries.filter(e => e.loanType === 'payable').reduce((sum, e) => sum + e.amount, 0);

    const awaitingIncome = waitingApprovals.filter(e => ! (e as any).loanType && (e.originalType === 'income' || !e.originalType)).reduce((sum, e) => sum + e.amount, 0);
    const awaitingExpense = waitingApprovals.filter(e => ! (e as any).loanType && e.originalType === 'expense').reduce((sum, e) => sum + e.amount, 0);
    
    // Final Tutar = Mevcut + Bekleyen Tahsilatlar + Alacaklar - Borçlar + Onay Bekleyen Net (Lend/Borrow logic)
    // Note: totalReceivables and totalPayables now include pending loans because of loanEntries filter update above.
    const projectedBalance = netBalance + totalPending + totalReceivables - totalPayables + (awaitingIncome - awaitingExpense);

    const handlePresetChange = (preset: DatePreset) => {
        setDatePreset(preset);
        if (preset !== 'custom') { setStartDate(''); setEndDate(''); }
    };

    return (
        <div>
            {/* Header */}
            <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                    <h2>Kasa</h2>
                    <p className="text-secondary">Gelir ve giderlerinizi takip edin.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn-primary" onClick={onAddExpense}>
                        <PlusCircle size={18} /> Gider Ekle
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="kasa-summary">
                <div className="kasa-card kasa-card-income">
                    <div className="kasa-card-icon"><TrendingUp size={20} /></div>
                    <div>
                        <span className="kasa-card-label">Toplam Gelir</span>
                        <span className="kasa-card-value">{totalIncome.toLocaleString('tr-TR')}₺</span>
                    </div>
                </div>
                <div className="kasa-card kasa-card-expense">
                    <div className="kasa-card-icon"><TrendingDown size={20} /></div>
                    <div>
                        <span className="kasa-card-label">Toplam Gider</span>
                        <span className="kasa-card-value">{totalExpense.toLocaleString('tr-TR')}₺</span>
                    </div>
                </div>
                <div className={`kasa-card ${netBalance >= 0 ? 'kasa-card-net-positive' : 'kasa-card-net-negative'}`}>
                    <div className="kasa-card-icon"><Wallet size={20} /></div>
                    <div>
                        <span className="kasa-card-label">Net Bakiye</span>
                        <span className="kasa-card-value">{netBalance >= 0 ? '+' : ''}{netBalance.toLocaleString('tr-TR')}₺</span>
                    </div>
                </div>
                <div className="kasa-card kasa-card-expectations">
                    <div className="kasa-card-icon"><Clock size={20} /></div>
                    <div style={{ flex: 1 }}>
                        <span className="kasa-card-label">Beklenen Durum</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span className="kasa-card-value" style={{ fontSize: '1rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Gelecek Tahsilatlar (+): <span style={{ color: '#22c55e' }}>+{totalPending + awaitingIncome + totalReceivables}₺</span></span>
                            </span>
                            <span className="kasa-card-value" style={{ fontSize: '1rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Ödenecek Borçlar (-): <span style={{ color: '#ef4444' }}>-{totalPayables + awaitingExpense}₺</span></span>
                            </span>
                            <span className="kasa-card-value" style={{ marginTop: '4px', borderTop: '1px solid var(--glass-border)', paddingTop: '4px' }}>
                                <b>{projectedBalance >= 0 ? '+' : ''}{projectedBalance.toLocaleString('tr-TR')}₺</b>
                            </span>
                        </div>
                    </div>
                </div>
            </div>

                <div className="kasa-extra-info">
                    <div className="kasa-extra-item" onClick={() => onOpenBorrows('receivable')} style={{ cursor: 'pointer' }}>
                        <HandCoins size={14} style={{ color: '#22c55e' }} />
                        <span>Verilen Borçlar:</span>
                        <strong style={{ color: '#22c55e' }}>{totalReceivables.toLocaleString('tr-TR')}₺</strong>
                    </div>
                    <div className="kasa-extra-item" onClick={() => onOpenBorrows('payable')} style={{ cursor: 'pointer' }}>
                        <TrendingDown size={14} style={{ color: '#ef4444' }} />
                        <span>Alınan Borçlar:</span>
                        <strong style={{ color: '#ef4444' }}>{totalPayables.toLocaleString('tr-TR')}₺</strong>
                    </div>
                    <div className="kasa-extra-item" onClick={onOpenPending} style={{ cursor: 'pointer' }}>
                        <Clock size={14} style={{ color: '#f97316' }} />
                        <span>Sipariş Tahsilatı:</span>
                        <strong style={{ color: '#f97316' }}>{totalPending.toLocaleString('tr-TR')}₺</strong>
                        <span className="kasa-extra-count">{pendingEntries.length} sipariş</span>
                    </div>
                    {waitingApprovals.length > 0 && (
                        <div className={`kasa-extra-item ${filter === 'waiting_approval' ? 'active' : ''}`} onClick={() => setFilter('waiting_approval')} style={{ cursor: 'pointer' }}>
                            <Clock size={14} style={{ color: '#f59e0b' }} />
                            <span>Onay Bekleyenler:</span>
                            <strong style={{ color: '#f59e0b' }}>{waitingApprovals.length} işlem</strong>
                        </div>
                    )}
                </div>

            {/* Date Filter */}
            <div className="kasa-date-filter">
                <div className="kasa-date-presets">
                    <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
                    {([
                        { key: 'all', label: 'Tümü' }, { key: 'today', label: 'Bugün' },
                        { key: 'week', label: 'Son 7 Gün' }, { key: 'month', label: 'Bu Ay' },
                        { key: 'custom', label: 'Özel Aralık' },
                    ] as { key: DatePreset; label: string }[]).map(p => (
                        <button key={p.key} className={`kasa-date-btn ${datePreset === p.key ? 'active' : ''}`} onClick={() => handlePresetChange(p.key)}>
                            {p.label}
                        </button>
                    ))}
                </div>
                {datePreset === 'custom' && (
                    <div className="kasa-date-inputs">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <span style={{ color: 'var(--text-secondary)' }}>→</span>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                )}
            </div>

            {/* Type Filter */}
            <div className="kasa-filters">
                <button className={`kasa-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                    Tümü <span className="kasa-badge">{dateFilteredTransactions.length}</span>
                </button>
                <button className={`kasa-filter-btn ${filter === 'income' ? 'active' : ''}`} onClick={() => setFilter('income')}>
                    Gelirler <span className="kasa-badge">{dateFilteredTransactions.filter(e => e.type === 'income').length}</span>
                </button>
                <button className={`kasa-filter-btn ${filter === 'expense' ? 'active' : ''}`} onClick={() => setFilter('expense')}>
                    Giderler <span className="kasa-badge">{dateFilteredTransactions.filter(e => e.type === 'expense').length}</span>
                </button>
            </div>

            {/* Entries List */}
            <div className="kasa-entries">
                {filteredEntries.length === 0 ? (
                    <div className="products-empty"><Wallet size={48} /><p>Kayıt bulunamadı</p></div>
                ) : (
                    filteredEntries.map(entry => (
                        <div key={entry.id} className={`kasa-entry ${entry.type}`}>
                            <div className="kasa-entry-icon">
                                {(() => {
                                    if (entry.type === 'waiting_approval') {
                                        return (entry as any).originalType === 'income' ? <TrendingUp size={18} /> : <TrendingDown size={18} />;
                                    }
                                    if (entry.type === 'loan') {
                                        return entry.loanType === 'receivable' ? <TrendingDown size={18} /> : <TrendingUp size={18} />;
                                    }
                                    return entry.type === 'income' ? <TrendingUp size={18} /> : <TrendingDown size={18} />;
                                })()}
                            </div>
                            <div className="kasa-entry-info">
                                <span className="kasa-entry-title">
                                    {(() => {
                                        if (entry.type === 'waiting_approval') {
                                            if ((entry as any).loanType) {
                                                const isPayable = (entry as any).loanType === 'payable';
                                                return isPayable 
                                                    ? `Borç Alındı: ${entry.borrower} (Kasa Girişi)` 
                                                    : `Borç Verildi: ${entry.borrower} (Kasa Çıkışı)`;
                                            }
                                            return (entry as any).originalType === 'income' ? (entry.orderTitle || 'Gelir') : (entry.description || entry.category || 'Gider');
                                        }
                                        if (entry.type === 'loan') {
                                            const isPayable = entry.loanType === 'payable';
                                            return isPayable 
                                                ? `Borç Alındı: ${entry.borrower} (Geri Ödenecek)` 
                                                : `Borç Verildi: ${entry.borrower} (Tahsil Edilecek)`;
                                        }
                                        return entry.type === 'income' ? (entry.orderTitle || 'Gelir') : (entry.description || entry.category || 'Gider');
                                    })()}
                                </span>
                                <span className="kasa-entry-detail">
                                    {((entry as any).originalType === 'income' || entry.type === 'income' || entry.type === 'waiting_approval' && (entry as any).originalType !== 'expense') && entry.customer && `👤 ${entry.customer}`}
                                    {entry.type === 'expense' && entry.category && `📁 ${entry.category}`}
                                    {entry.createdAt && ` · ${new Date(entry.createdAt).toLocaleDateString('tr-TR')}`}
                                </span>
                            </div>
                            <div className="kasa-entry-amount">
                                <span className={(() => {
                                    if (entry.type === 'income') return 'amount-positive';
                                    if (entry.type === 'expense') return 'amount-negative';
                                    if (entry.type === 'waiting_approval') {
                                        if ((entry as any).loanType) {
                                            return (entry as any).loanType === 'payable' ? 'amount-positive' : 'amount-negative';
                                        }
                                        return (entry as any).originalType === 'income' ? 'amount-positive' : 'amount-negative';
                                    }
                                    if (entry.type === 'loan' && entry.status === 'approved') {
                                        return entry.loanType === 'payable' ? 'amount-positive' : 'amount-negative';
                                    }
                                    return 'amount-warning';
                                })()}>
                                    {(() => {
                                        const isPos = entry.type === 'income' || 
                                                    (entry.type === 'waiting_approval' && (entry as any).originalType === 'income') ||
                                                    (entry.type === 'loan' && entry.loanType === 'payable') ||
                                                    (entry.type === 'waiting_approval' && (entry as any).loanType === 'payable');
                                        return isPos ? '+' : '-';
                                    })()}{entry.amount.toLocaleString('tr-TR')}₺
                                </span>
                            </div>
                            {entry.type === 'waiting_approval' ? (
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    <button className="btn-icon" onClick={() => handleApprove(entry)} title="Onayla" style={{ color: '#22c55e', background: 'rgba(34, 197, 94, 0.1)', padding: '4px', borderRadius: '4px' }}>
                                        <Check size={18} />
                                    </button>
                                    <button className="btn-icon" onClick={() => handleReject(entry)} title="Reddet" style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '4px', borderRadius: '4px' }}>
                                        <X size={18} />
                                    </button>
                                </div>
                            ) : (
                                <button className="kasa-entry-delete" onClick={() => handleDelete(entry)} title="Sil">
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>

        </div>
    );
}

/* ===================== EXPORTED MODALS ===================== */

export function AddExpenseModal({ onClose, kasaSorumlusu }: { onClose: () => void, kasaSorumlusu: any }) {
    const [amount, setAmount] = useState<number | ''>('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState(expenseCategories[0]);
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || amount <= 0) return;
        setIsSaving(true);
        try {
            const entryData: any = {
                amount: Number(amount),
                description: description.trim() || null,
                category,
                createdAt: new Date().toISOString()
            };

            if (kasaSorumlusu) {
                entryData.type = 'waiting_approval';
                entryData.originalType = 'expense';
                entryData.status = 'pending';
                // Trigger notification
                fetch('/api/send-notification', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        uid: kasaSorumlusu.uid,
                        title: 'Onay Bekleyen Gider',
                        body: `${amount}₺ tutarında yeni bir gider onayı bekleniyor: ${description || category}`,
                        data: { type: 'approval_required' }
                    })
                }).catch(err => console.error('Notification error:', err));
            } else {
                entryData.type = 'expense';
                // Direct Entry Broadcast
                broadcastNotification('Kasadan Gider Çıkışı', `${amount}₺ tutarında gider eklendi: ${description || category}`);
            }

            await addDoc(collection(db, 'kasa'), entryData);
            onClose();
        } catch (error) { console.error('Gider eklenirken hata:', error); }
        finally { setIsSaving(false); }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-panel animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
                <div className="modal-header">
                    <h2>Gider Ekle</h2>
                    <button onClick={onClose} className="btn-icon"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-group">
                        <label>Kategori</label>
                        <select value={category} onChange={e => setCategory(e.target.value)}>
                            {expenseCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Tutar (₺) <span className="text-danger">*</span></label>
                        <input type="number" min="0.01" step="0.01" required placeholder="Örn: 350" value={amount} onChange={e => setAmount(Number(e.target.value))} style={{ fontSize: '1.1rem', fontWeight: 600 }} />
                    </div>
                    <div className="form-group">
                        <label>Açıklama</label>
                        <input type="text" placeholder="Örn: 1kg PLA filament" value={description} onChange={e => setDescription(e.target.value)} />
                    </div>
                    <div className="modal-actions">
                        <div style={{ flex: 1 }} />
                        <button type="button" onClick={onClose} className="btn-secondary">İptal</button>
                        <button type="submit" disabled={isSaving} className="btn-primary" style={{ background: '#ef4444' }}>
                            {isSaving ? "Kaydediliyor..." : <><Save size={16} /> Gider Ekle</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function PendingModal({ onClose, setGlobalConfirmDialog, kasaSorumlusu, currentUserUid }: { onClose: () => void, setGlobalConfirmDialog: any, kasaSorumlusu: any, currentUserUid: string }) {
    const [pendings, setPendings] = useState<KasaEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'kasa'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() })) as KasaEntry[];
            setPendings(data.filter(e => e.type === 'pending'));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleMarkAsPaid = (entry: KasaEntry) => {
        setGlobalConfirmDialog({
            message: `${entry.amount}₺ tutarındaki bu ödemeyi tahsil edildi (kasaya eklendi) olarak işaretlemek istiyor musunuz?`,
            confirmVariant: 'primary',
            confirmText: 'Tahsil Et',
            onConfirm: async () => {
                setIsSaving(true);
                try {
                    if (kasaSorumlusu) {
                        await updateDoc(doc(db, 'kasa', entry.id), {
                            type: 'waiting_approval',
                            originalType: 'income',
                            status: 'pending',
                            updatedAt: new Date().toISOString()
                        });
                    } else {
                        await updateDoc(doc(db, 'kasa', entry.id), { type: 'income', createdAt: new Date().toISOString() });
                        // Direct Entry Broadcast
                        broadcastNotification('Kasaya Gelir Girdi', `${entry.amount}₺ tutarında ödeme tahsil edildi: ${entry.customer}`);
                        
                        // Optional: update order paymentStatus to 'paid' if orderId exists
                        if (entry.orderId) {
                            await updateDoc(doc(db, 'orders', entry.orderId), { paymentStatus: 'paid' });
                        }
                    }
                } catch (e) { console.error('Tahsilat hatası:', e); }
                finally {
                    setIsSaving(false);
                    setGlobalConfirmDialog(null);
                }
            }
        });
    };

    const handleDelete = (entryId: string) => {
        if (kasaSorumlusu && currentUserUid !== kasaSorumlusu.uid) {
            alert('Sadece kasa sorumlusu kayıt silebilir.');
            return;
        }
        setGlobalConfirmDialog({
            message: 'Bu borç kaydını tamamen silmek istediğinize emin misiniz?',
            confirmVariant: 'danger',
            confirmText: 'Sil',
            onConfirm: async () => {
                setIsSaving(true);
                try { await deleteDoc(doc(db, 'kasa', entryId)); } catch (e) { console.error(e); }
                finally {
                    setIsSaving(false);
                    setGlobalConfirmDialog(null);
                }
            }
        });
    };

    const totalPending = pendings.reduce((sum, e) => sum + e.amount, 0);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-panel animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                    <h2>Alınacak Ödemeler (Açık Hesap)</h2>
                    <button onClick={onClose} className="btn-icon"><X size={20} /></button>
                </div>

                <div className="modal-form">
                    <div className="summary-card" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '1rem', borderRadius: '12px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Toplam Alacak</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{totalPending.toLocaleString('tr-TR')}₺</div>
                        </div>
                        <HandCoins size={32} color="#f59e0b" opacity={0.8} />
                    </div>

                    <div className="entries-list" style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Yükleniyor...</div>
                        ) : pendings.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Alınacak ödeme bulunmuyor.</div>
                        ) : (
                            pendings.map(entry => (
                                <div key={entry.id} className="kasa-entry-item" style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.02)' }}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entry.customer}</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>{entry.amount}₺</span>
                                            <span>•</span>
                                            <span title={entry.orderTitle} style={{ maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.orderTitle}</span>
                                            <span>•</span>
                                            <span>{new Date(entry.createdAt).toLocaleDateString('tr-TR')}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            className="btn-primary"
                                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', background: '#22c55e' }}
                                            onClick={() => handleMarkAsPaid(entry)}
                                            title="Ödendi İşaretle & Kasaya Ekle"
                                            disabled={isSaving}
                                        >
                                            <Check size={16} style={{ marginRight: '0.2rem' }} /> Tahsil Et
                                        </button>
                                        <button
                                            className="kasa-entry-delete"
                                            onClick={() => handleDelete(entry.id)}
                                            title="Kaydı Sil"
                                            disabled={isSaving}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function BorrowsModal({ onClose, setGlobalConfirmDialog, kasaSorumlusu, defaultType, currentUserUid }: { onClose: () => void, setGlobalConfirmDialog: any, kasaSorumlusu: any, defaultType?: 'receivable' | 'payable', currentUserUid: string }) {
    const [entries, setEntries] = useState<KasaEntry[]>([]);
    const [borrowAmount, setBorrowAmount] = useState<number | ''>('');
    const [borrower, setBorrower] = useState('');
    const [borrowNote, setBorrowNote] = useState('');
    const [loanType, setLoanType] = useState<'receivable' | 'payable'>(defaultType || 'receivable');
    const [isBorrowing, setIsBorrowing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Filter logic for the modal's internal views
    const loanEntries = entries.filter(e => e.type === 'loan' || (e.type === 'waiting_approval' && (e as any).loanType));
    const totalReceivables = loanEntries.filter(e => e.loanType === 'receivable' || !e.loanType).reduce((sum, e) => sum + e.amount, 0);
    const totalPayables = loanEntries.filter(e => e.loanType === 'payable').reduce((sum, e) => sum + e.amount, 0);

    useEffect(() => {
        const q = query(collection(db, 'kasa'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setEntries(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as KasaEntry[]);
        });
        return () => unsubscribe();
    }, []);


    const handleBorrow = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!borrowAmount || borrowAmount <= 0 || !borrower.trim()) return;
        setIsBorrowing(true);
        try {
            const entryData: any = {
                amount: Number(borrowAmount),
                borrower: borrower.trim(),
                description: borrowNote.trim() || null,
                loanType: loanType,
                createdAt: new Date().toISOString()
            };

            if (kasaSorumlusu) {
                entryData.type = 'waiting_approval';
                // If we are recording a WE OWE (payable), it's a potential income later when we pay? 
                // No, when we BORROW money, bakiye should increase (income). 
                // When we LEND money (receivable), bakiye should decrease (expense).
                // Let's stick to simple: Lending = Expense (money goes out), Borrowing = Income (money comes in).
                entryData.originalType = loanType === 'receivable' ? 'expense' : 'income';
                entryData.status = 'pending';
            } else {
                entryData.type = 'loan';
            }

            await addDoc(collection(db, 'kasa'), entryData);
            setBorrowAmount(''); setBorrower(''); setBorrowNote('');
        } catch (error) { console.error(error); }
        finally { setIsBorrowing(false); }
    };

    const handleLoanReturn = (entry: KasaEntry) => {
        const isReceivable = entry.loanType === 'receivable' || !entry.loanType;
        const msg = isReceivable 
            ? `${entry.borrower} ${entry.amount}₺ borcunu iade etti mi? (Kasaya gelir olarak girecek)`
            : `${entry.borrower} kişisine olan ${entry.amount}₺ borcunuzu ödediniz mi? (Kasadan gider olarak çıkacak)`;

        setGlobalConfirmDialog({
            message: msg,
            confirmVariant: 'primary',
            confirmText: 'Onayla',
            onConfirm: async () => {
                setIsSaving(true);
                try {
                    if (kasaSorumlusu) {
                        await updateDoc(doc(db, 'kasa', entry.id), {
                            type: 'waiting_approval',
                            originalType: isReceivable ? 'income' : 'expense',
                            status: 'pending',
                            description: isReceivable ? `${entry.borrower} borç iadesi` : `${entry.borrower} borç ödemesi`,
                            updatedAt: new Date().toISOString()
                        });
                    } else {
                        await deleteDoc(doc(db, 'kasa', entry.id));
                        broadcastNotification(
                            isReceivable ? 'Borç İadesi Alındı' : 'Borç Ödendi', 
                            isReceivable 
                                ? `${entry.borrower} kişisinden ${entry.amount}₺ iade alındı.` 
                                : `${entry.borrower} kişisine ${entry.amount}₺ borç ödendi.`
                        );
                    }
                } catch (e) { console.error(e); }
                finally { setIsSaving(false); setGlobalConfirmDialog(null); }
            }
        });
    };

    const handleDelete = (entryId: string) => {
        if (kasaSorumlusu && currentUserUid !== kasaSorumlusu.uid) {
            alert('Sadece kasa sorumlusu kayıt silebilir.');
            return;
        }
        setGlobalConfirmDialog({
            message: 'Bu kaydı silmek istediğinize emin misiniz?',
            confirmVariant: 'danger',
            confirmText: 'Sil',
            onConfirm: async () => {
                setIsSaving(true);
                try { await deleteDoc(doc(db, 'kasa', entryId)); } catch (e) { console.error(e); }
                finally { setIsSaving(false); setGlobalConfirmDialog(null); }
            }
        });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-panel animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
                <div className="modal-header">
                    <h2>Borç Yönetimi (Verilen/Alınan)</h2>
                    <button onClick={onClose} className="btn-icon" disabled={isBorrowing || isSaving}><X size={20} /></button>
                </div>
                <div className="modal-form" style={{ gap: '0.75rem' }}>
                    
                    {/* Direction Toggle */}
                    {!defaultType && (
                        <div style={{ display: 'flex', background: 'var(--bg-tertiary)', padding: '0.25rem', borderRadius: '10px', gap: '0.25rem' }}>
                            <button 
                                type="button"
                                onClick={() => setLoanType('receivable')}
                                style={{ 
                                    flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                                    background: loanType === 'receivable' ? '#22c55e' : 'transparent',
                                    color: loanType === 'receivable' ? 'white' : 'var(--text-secondary)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Borç Verdim (Para Çıktı)
                            </button>
                            <button 
                                type="button"
                                onClick={() => setLoanType('payable')}
                                style={{ 
                                    flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                                    background: loanType === 'payable' ? '#ef4444' : 'transparent',
                                    color: loanType === 'payable' ? 'white' : 'var(--text-secondary)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Borç Alındı / Borçluyum (Para Girişi)
                            </button>
                        </div>
                    )}

                    {/* Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        {(!defaultType || defaultType === 'receivable') && (
                            <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)', gridColumn: defaultType === 'receivable' ? 'span 2' : 'span 1' }}>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Toplam Verilen</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#22c55e' }}>{totalReceivables.toLocaleString('tr-TR')}₺</div>
                            </div>
                        )}
                        {(!defaultType || defaultType === 'payable') && (
                            <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', gridColumn: defaultType === 'payable' ? 'span 2' : 'span 1' }}>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Toplam Alınan</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ef4444' }}>{totalPayables.toLocaleString('tr-TR')}₺</div>
                            </div>
                        )}
                    </div>

                    {/* Add Form */}
                    <form onSubmit={handleBorrow} className="kasa-borrow-form" style={{ marginTop: '0.5rem' }}>
                        <input type="text" required disabled={isBorrowing || isSaving} placeholder={loanType === 'receivable' ? "Kime verdiniz?" : "Kimden aldınız?"} value={borrower} onChange={e => setBorrower(e.target.value)} />
                        <input type="number" required disabled={isBorrowing || isSaving} min="0.01" step="0.01" placeholder="Tutar (₺)" value={borrowAmount} onChange={e => setBorrowAmount(Number(e.target.value))} />
                        <input type="text" disabled={isBorrowing || isSaving} placeholder="Not (opsiyonel)" value={borrowNote} onChange={e => setBorrowNote(e.target.value)} />
                        <button type="submit" className="btn-primary" disabled={isBorrowing || isSaving} style={{ background: loanType === 'receivable' ? '#22c55e' : '#ef4444', whiteSpace: 'nowrap' }}>
                            {isBorrowing ? "Ekleniyor..." : <><PlusCircle size={16} /> Kaydet</>}
                        </button>
                    </form>

                    {/* List */}
                    {(() => {
                        const filtered = loanEntries.filter(e => (e.loanType || 'receivable') === loanType);
                        const pending = filtered.filter(e => e.status === 'pending');
                        const approved = filtered.filter(e => e.status !== 'pending');

                        if (filtered.length === 0) {
                            return (
                                <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' }}>
                                    <Check size={36} style={{ color: '#22c55e', marginBottom: '0.5rem' }} />
                                    <p>Aktif kayıt yok 🎉</p>
                                </div>
                            );
                        }

                        const renderEntry = (entry: KasaEntry) => {
                            const isRec = entry.loanType === 'receivable' || !entry.loanType;
                            return (
                                <div key={entry.id} className="kasa-entry" style={{ borderLeft: `4px solid ${isRec ? '#22c55e' : '#ef4444'}` }}>
                                    <div className="kasa-entry-icon" style={{ background: isRec ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: isRec ? '#22c55e' : '#ef4444' }}>
                                        {isRec ? <HandCoins size={18} /> : <Undo2 size={18} />}
                                    </div>
                                    <div className="kasa-entry-info">
                                        <span className="kasa-entry-title">
                                            👤 {entry.borrower || 'Bilinmiyor'} 
                                            <small style={{ opacity: 0.6, fontWeight: 400, marginLeft: '4px' }}>({isRec ? 'Borç Verildi' : 'Borç Alındı'})</small>
                                            {entry.status === 'pending' && <span className="loan-status-badge">Bekliyor</span>}
                                        </span>
                                        <span className="kasa-entry-detail">
                                            {entry.description && `📝 ${entry.description} · `}
                                            {entry.createdAt && new Date(entry.createdAt).toLocaleDateString('tr-TR')}
                                        </span>
                                    </div>
                                    <div className="kasa-entry-amount">
                                        <span style={{ color: isRec ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{isRec ? '+' : '-'}{entry.amount.toLocaleString('tr-TR')}₺</span>
                                    </div>
                                    <button 
                                        className="kasa-paid-btn" 
                                        style={{ 
                                            borderColor: isRec ? '#22c55e' : '#ef4444', 
                                            color: isRec ? '#22c55e' : '#ef4444', 
                                            background: isRec ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                            opacity: entry.status === 'pending' ? 0.5 : 1,
                                            cursor: entry.status === 'pending' ? 'not-allowed' : 'pointer'
                                        }} 
                                        onClick={() => entry.status !== 'pending' && handleLoanReturn(entry)} 
                                        disabled={isSaving || entry.status === 'pending'}
                                    >
                                        <Check size={14} /> {isRec ? 'Tahsil Et' : 'Öde'}
                                    </button>
                                    <button className="kasa-entry-delete" style={{ opacity: 1 }} onClick={() => handleDelete(entry.id)} title="Sil" disabled={isSaving}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            );
                        };

                        return (
                            <div className="kasa-entries" style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {pending.length > 0 && (
                                    <div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Clock size={12} /> Onay Bekleyenler ({pending.length})
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {pending.map(renderEntry)}
                                        </div>
                                    </div>
                                )}
                                {approved.length > 0 && (
                                    <div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Check size={12} /> Onaylanan / Aktif Kayıtlar ({approved.length})
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {approved.map(renderEntry)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}
