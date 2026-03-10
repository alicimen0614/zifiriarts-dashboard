import { useState, useRef, useEffect } from 'react';
import { PlusCircle, Clock, Printer, PackageCheck, LogOut, ChevronRight, ChevronLeft, Filter, Search, Calendar, X, Package, LayoutDashboard, Wallet, Bell, BellRing } from 'lucide-react';
import Login from './components/Login';
import OrderModal from './components/OrderModal';
import ProductsPage, { ProductModal } from './components/ProductsPage';
import type { Product } from './components/ProductsPage';
import KasaPage, { AddExpenseModal, PendingModal, BorrowsModal } from './components/KasaPage';
import { auth, db } from './lib/firebase';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, setDoc, addDoc, query, orderBy } from 'firebase/firestore';
import { useFCMToken } from './lib/useFCMToken';
import './index.css';

// Mock Data Types
type OrderStatus = 'todo' | 'inprogress' | 'done' | 'delivered';

const statusFlow: OrderStatus[] = ['todo', 'inprogress', 'done', 'delivered'];
const statusLabels: Record<OrderStatus, string> = {
    todo: 'Alındı',
    inprogress: 'Baskıda',
    done: 'Hazır',
    delivered: 'Teslim'
};

type FilterType = 'all' | 'active' | 'completed' | 'delivered';

const filterConfig: { key: FilterType; label: string; statuses: OrderStatus[] }[] = [
    { key: 'all', label: 'Tümü', statuses: ['todo', 'inprogress', 'done', 'delivered'] },
    { key: 'active', label: 'Aktif Siparişler', statuses: ['todo', 'inprogress'] },
    { key: 'completed', label: 'Tamamlanan', statuses: ['done'] },
    { key: 'delivered', label: 'Teslim Edilenler', statuses: ['delivered'] },
];

interface Order {
    id: string;
    title: string;
    customer: string;
    status: OrderStatus;
    weight: number;
    time: number;
    price?: number;
    color?: string;
    assignee?: string;
    createdAt?: any; // Firestore Timestamp or string
}

// Firestore Timestamp → YYYY-MM-DD string
function toDateString(val: any): string | null {
    if (!val) return null;
    try {
        // Firestore Timestamp object
        if (val.toDate) {
            return val.toDate().toISOString().slice(0, 10);
        }
        // Already a string (ISO format)
        if (typeof val === 'string') {
            return val.slice(0, 10);
        }
        // Date object
        if (val instanceof Date) {
            return val.toISOString().slice(0, 10);
        }
    } catch {
        return null;
    }
    return null;
}

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userEmail, setUserEmail] = useState('');
    const [isAuthLoading, setIsAuthLoading] = useState(true);

    // Real orders from Firestore
    const [orders, setOrders] = useState<Order[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [activeTab, setActiveTab] = useState<'orders' | 'products' | 'kasa'>('orders');
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);
    const [isBorrowsModalOpen, setIsBorrowsModalOpen] = useState(false);

    // Delivery confirmation dialog
    const [deliveryDialog, setDeliveryDialog] = useState<{ order: Order; finalPrice: number; addToKasa: boolean; isPromo: boolean; notPaid: boolean } | null>(null);

    // Global Confirm Dialog (e.g. for Kasa deletions)
    const [globalConfirmDialog, setGlobalConfirmDialog] = useState<{ message: string; onConfirm: () => void; confirmVariant?: 'danger' | 'primary'; confirmText?: string; cancelText?: string } | null>(null);

    // Custom Drag State
    const [dragState, setDragState] = useState<{ order: Order, offsetX: number, offsetY: number, width: number } | null>(null);
    const ghostRef = useRef<HTMLDivElement>(null);

    // Initial Auth Check & Save user to Firestore
    const { token, permissionStatus, requestPermission } = useFCMToken(isAuthenticated ? auth.currentUser?.uid || null : null);
    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (user && user.email) {
                setIsAuthenticated(true);
                setUserEmail(user.email);
                // Save user to Firestore for team dropdown
                try {
                    await setDoc(doc(db, 'users', user.uid), {
                        email: user.email,
                        displayName: user.displayName || user.email.split('@')[0],
                        lastLogin: new Date().toISOString()
                    }, { merge: true });
                } catch (e) {
                    console.error('User save error:', e);
                }
            } else {
                setIsAuthenticated(false);
                setUserEmail('');
            }
            setIsAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // Fetch Orders from Firestore
    useEffect(() => {
        if (!isAuthenticated) return;

        const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ordersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Order[];
            setOrders(ordersData);
        }, (error) => {
            console.error("Firestore error:", error);
        });

        return () => unsubscribe();
    }, [isAuthenticated]);

    if (isAuthLoading) {
        return (
            <div className="loading-screen">
                <div className="loading-logo">3D Print Tracker</div>
                <div className="loading-spinner"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Login onLogin={() => { }} />;
    }

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (e) {
            console.error(e);
        }
    };

    const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
        // If moving to 'delivered', show confirmation dialog
        if (newStatus === 'delivered') {
            const order = orders.find(o => o.id === orderId);
            if (order) {
                setDeliveryDialog({
                    order,
                    finalPrice: order.price || 0,
                    addToKasa: true,
                    isPromo: false,
                    notPaid: false
                });
                return;
            }
        }

        // Optimistic UI update
        setOrders(prev => prev.map(order =>
            order.id === orderId ? { ...order, status: newStatus } : order
        ));
        try {
            const orderRef = doc(db, 'orders', orderId);
            await updateDoc(orderRef, { status: newStatus });
        } catch (error) {
            console.error('Status update error:', error);
        }
    };

    const confirmDelivery = async () => {
        if (!deliveryDialog) return;
        const { order, finalPrice, addToKasa, notPaid } = deliveryDialog;

        // Update order status and price
        setOrders(prev => prev.map(o =>
            o.id === order.id ? { ...o, status: 'delivered' as OrderStatus, price: finalPrice } : o
        ));
        try {
            const orderRef = doc(db, 'orders', order.id);
            await updateDoc(orderRef, { status: 'delivered', price: finalPrice });

            // Add to kasa if checked
            if (addToKasa && finalPrice > 0) {
                await addDoc(collection(db, 'kasa'), {
                    orderId: order.id,
                    orderTitle: order.title,
                    customer: order.customer,
                    amount: finalPrice,
                    type: 'income',
                    createdAt: new Date().toISOString()
                });
            }

            // Add as pending payment if not paid
            if (notPaid && finalPrice > 0) {
                await addDoc(collection(db, 'kasa'), {
                    orderId: order.id,
                    orderTitle: order.title,
                    customer: order.customer,
                    amount: finalPrice,
                    type: 'pending',
                    createdAt: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Delivery confirmation error:', error);
        }
        setDeliveryDialog(null);
    };

    // Helper to filter orders by status + search + date
    const getFilteredOrdersByStatus = (status: OrderStatus) => {
        return orders.filter(o => {
            if (o.status !== status) return false;
            // Text search: title or customer name
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchesTitle = o.title.toLowerCase().includes(q);
                const matchesCustomer = o.customer.toLowerCase().includes(q);
                const matchesAssignee = o.assignee?.toLowerCase().includes(q) || false;
                if (!matchesTitle && !matchesCustomer && !matchesAssignee) return false;
            }
            // Date filter
            if (dateFilter) {
                const orderDate = toDateString(o.createdAt);
                if (!orderDate || orderDate !== dateFilter) return false;
            }
            return true;
        });
    };

    // Get visible statuses based on active filter
    const currentFilterConfig = filterConfig.find(f => f.key === activeFilter)!;
    const visibleStatuses = currentFilterConfig.statuses;

    // Count for filter badges (respects search/date)
    const getFilterCount = (filter: FilterType) => {
        const cfg = filterConfig.find(f => f.key === filter)!;
        return orders.filter(o => {
            if (!cfg.statuses.includes(o.status)) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                if (!o.title.toLowerCase().includes(q) && !o.customer.toLowerCase().includes(q) && !(o.assignee?.toLowerCase().includes(q))) return false;
            }
            if (dateFilter) {
                const orderDate = toDateString(o.createdAt);
                if (!orderDate || orderDate !== dateFilter) return false;
            }
            return true;
        }).length;
    };

    const clearFilters = () => {
        setSearchQuery('');
        setDateFilter('');
        setActiveFilter('all');
    };

    const hasActiveFilters = searchQuery.trim() !== '' || dateFilter !== '' || activeFilter !== 'all';

    const handleDragStart = (e: React.DragEvent, order: Order) => {
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(img, 0, 0);

        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();

        setDragState({
            order,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            width: rect.width
        });

        e.dataTransfer.setData('text/plain', order.id);
        e.dataTransfer.effectAllowed = 'move';

        setTimeout(() => {
            target.classList.add('is-dragging');
        }, 0);
    };

    const handleDrag = (e: React.DragEvent) => {
        if (e.clientX === 0 && e.clientY === 0) return;

        if (ghostRef.current && dragState) {
            ghostRef.current.style.left = `${e.clientX - dragState.offsetX}px`;
            ghostRef.current.style.top = `${e.clientY - dragState.offsetY}px`;
        }
    };

    const handleDragEnd = (e: React.DragEvent) => {
        const target = e.currentTarget as HTMLElement;
        target.classList.remove('is-dragging');
        setDragState(null);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, newStatus: OrderStatus) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain') || dragState?.order.id;
        if (!id) return;

        setDragState(null);

        // Route through handleStatusChange so delivery dialog is triggered
        handleStatusChange(id, newStatus);
    };

    return (
        <div className="min-h-screen app-container">
            {/* Custom Drag Layer: Ekranın en üstünde, mouse ile gelen özel %100 opak hayalet kart */}
            {dragState && (
                <div
                    ref={ghostRef}
                    style={{
                        position: 'fixed',
                        pointerEvents: 'none',
                        zIndex: 9999,
                        width: dragState.width,
                        transform: 'rotate(4deg)', // Hafif açılı premium görünüm
                        boxShadow: '0 20px 40px rgba(0,0,0,0.6)', // Keskin ve derin gölge
                        transition: 'none' // Mouse takibinde gecikme olmasın
                    }}
                >
                    <OrderCard order={dragState.order} isGhost={true} />
                </div>
            )}

            {/* Navbar area */}
            <header className="glass-panel header-bar">
                <div className="container header-content">
                    <div className="logo-area">
                        <img src="/logo.jpg" alt="ZifiriArts Logo" className="logo-img" />
                        <h1>ZifiriArts</h1>
                    </div>
                    <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div className="nav-tabs">
                            <button
                                className={`nav-tab ${activeTab === 'orders' ? 'nav-tab-active' : ''}`}
                                onClick={() => setActiveTab('orders')}
                            >
                                <LayoutDashboard size={16} />
                                <span className="nav-tab-label">Siparişler</span>
                            </button>
                            <button
                                className={`nav-tab ${activeTab === 'products' ? 'nav-tab-active' : ''}`}
                                onClick={() => setActiveTab('products')}
                            >
                                <Package size={16} />
                                <span className="nav-tab-label">Ürünler</span>
                            </button>
                            <button
                                className={`nav-tab ${activeTab === 'kasa' ? 'nav-tab-active' : ''}`}
                                onClick={() => setActiveTab('kasa')}
                            >
                                <Wallet size={16} />
                                <span className="nav-tab-label">Kasa</span>
                            </button>
                        </div>

                        <button
                            className="btn-secondary"
                            onClick={requestPermission}
                            title={permissionStatus === 'granted' ? 'Bildirimler Açık' : 'Bildirimleri Aç'}
                            style={{
                                background: permissionStatus === 'granted' ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                                border: `1px solid ${permissionStatus === 'granted' ? '#22c55e' : 'var(--border-color)'}`,
                                color: permissionStatus === 'granted' ? '#22c55e' : 'var(--text-secondary)',
                                padding: '0.5rem',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            {permissionStatus === 'granted' ? <BellRing size={18} /> : <Bell size={18} />}
                        </button>

                        <button className="btn-secondary" onClick={handleLogout} title="Çıkış Yap" style={{
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-secondary)',
                            padding: '0.5rem',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center'
                        }}>
                            <LogOut size={18} />
                        </button>
                    </nav>
                </div>
            </header>

            <OrderModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingOrder(null); }} editOrder={editingOrder} />
            {isProductModalOpen && (
                <ProductModal onClose={() => { setIsProductModalOpen(false); setEditingProduct(null); }} editProduct={editingProduct} />
            )}
            {isExpenseModalOpen && (
                <AddExpenseModal onClose={() => setIsExpenseModalOpen(false)} />
            )}
            {isPendingModalOpen && (
                <PendingModal onClose={() => setIsPendingModalOpen(false)} setGlobalConfirmDialog={setGlobalConfirmDialog} />
            )}
            {isBorrowsModalOpen && (
                <BorrowsModal onClose={() => setIsBorrowsModalOpen(false)} setGlobalConfirmDialog={setGlobalConfirmDialog} />
            )}

            {/* Delivery Confirmation Dialog */}
            {deliveryDialog && (
                <div className="modal-overlay" onClick={() => setDeliveryDialog(null)}>
                    <div className="modal-content glass-panel animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h2>Teslim Onayı</h2>
                            <button onClick={() => setDeliveryDialog(null)} className="btn-icon">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-form">
                            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                                <strong>{deliveryDialog.order.title}</strong> siparişi teslim edilecek.
                            </p>
                            <div className="form-group">
                                <label>Tutar (₺)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={deliveryDialog.finalPrice}
                                    onChange={e => setDeliveryDialog(prev => prev ? { ...prev, finalPrice: Number(e.target.value) } : null)}
                                    style={{ fontSize: '1.1rem', fontWeight: 600 }}
                                />
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                                <input
                                    type="checkbox"
                                    checked={deliveryDialog.addToKasa}
                                    onChange={e => setDeliveryDialog(prev => prev ? { ...prev, addToKasa: e.target.checked, notPaid: e.target.checked ? false : prev.notPaid } : null)}
                                    style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                                />
                                Kasaya gelir olarak ekle
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                                <input
                                    type="checkbox"
                                    checked={deliveryDialog.notPaid}
                                    onChange={e => setDeliveryDialog(prev => prev ? { ...prev, notPaid: e.target.checked, addToKasa: e.target.checked ? false : prev.addToKasa, isPromo: e.target.checked ? false : prev.isPromo } : null)}
                                    style={{ width: '18px', height: '18px', accentColor: '#f97316' }}
                                />
                                Ücreti alınmadı (sonra ödenecek)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                                <input
                                    type="checkbox"
                                    checked={deliveryDialog.isPromo}
                                    onChange={e => setDeliveryDialog(prev => prev ? { ...prev, isPromo: e.target.checked, finalPrice: e.target.checked ? 0 : prev.finalPrice, addToKasa: e.target.checked ? false : prev.addToKasa, notPaid: e.target.checked ? false : prev.notPaid } : null)}
                                    style={{ width: '18px', height: '18px', accentColor: '#f59e0b' }}
                                />
                                Reklam için kullanıldı (ücretsiz)
                            </label>
                            {deliveryDialog.finalPrice <= 0 && !deliveryDialog.isPromo && (
                                <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: 0 }}>
                                    ⚠️ 0₺ teslim için "Reklam için kullanıldı" seçeneğini işaretleyin
                                </p>
                            )}
                            <div className="modal-actions">
                                <div style={{ flex: 1 }} />
                                <button type="button" onClick={() => setDeliveryDialog(null)} className="btn-secondary">İptal</button>
                                <button
                                    type="button"
                                    onClick={confirmDelivery}
                                    className="btn-primary"
                                    style={{ background: '#22c55e' }}
                                    disabled={deliveryDialog.finalPrice <= 0 && !deliveryDialog.isPromo}
                                >
                                    ✓ Teslim Et
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Confirmation Dialog */}
            {globalConfirmDialog && (
                <div className="modal-overlay" onClick={e => { e.stopPropagation(); setGlobalConfirmDialog(null); }}>
                    <div className="modal-content glass-panel animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '360px', zIndex: 1100 }}>
                        <div className="modal-header">
                            <h2>Onay</h2>
                            <button onClick={() => setGlobalConfirmDialog(null)} className="btn-icon"><X size={20} /></button>
                        </div>
                        <div className="modal-form">
                            <p style={{ color: 'var(--text-primary)', margin: 0 }}>{globalConfirmDialog.message}</p>
                            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                                <div style={{ flex: 1 }} />
                                <button type="button" onClick={() => setGlobalConfirmDialog(null)} className="btn-secondary">
                                    {globalConfirmDialog.cancelText || 'İptal'}
                                </button>
                                <button
                                    type="button"
                                    onClick={globalConfirmDialog.onConfirm}
                                    className="btn-primary"
                                    style={{ background: globalConfirmDialog.confirmVariant === 'danger' ? '#ef4444' : 'var(--accent-primary)' }}
                                >
                                    {globalConfirmDialog.confirmText || 'Onayla'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="container main-content animate-fade-in">
                {activeTab === 'products' ? (
                    <ProductsPage onAddProduct={() => setIsProductModalOpen(true)} onEditProduct={(product) => { setEditingProduct(product); setIsProductModalOpen(true); }} />
                ) : activeTab === 'kasa' ? (
                    <KasaPage
                        onAddExpense={() => setIsExpenseModalOpen(true)}
                        onOpenPending={() => setIsPendingModalOpen(true)}
                        onOpenBorrows={() => setIsBorrowsModalOpen(true)}
                        setGlobalConfirmDialog={setGlobalConfirmDialog}
                    />
                ) : (
                    <>
                        <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2>Sipariş Panosu</h2>
                                <p className="text-secondary">Tüm siparişlerin güncel durumları.</p>
                            </div>
                            <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
                                <PlusCircle size={18} />
                                Yeni Sipariş
                            </button>
                        </div>

                        {/* Filter Section */}
                        <div className="filter-section">
                            {/* Status Tabs */}
                            <div className="filter-tabs-row">
                                {filterConfig.map(f => (
                                    <button
                                        key={f.key}
                                        className={`filter-tab ${activeFilter === f.key ? 'filter-tab-active' : ''}`}
                                        onClick={() => setActiveFilter(f.key)}
                                    >
                                        {f.label}
                                        <span className="filter-badge">{getFilterCount(f.key)}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Date & Search Row */}
                            <div className="filter-inputs-row">
                                <div className="filter-date" onClick={(e) => {
                                    const input = (e.currentTarget as HTMLElement).querySelector('input');
                                    input?.showPicker?.();
                                }}>
                                    <Calendar size={15} className="filter-date-icon" />
                                    <input
                                        type="date"
                                        value={dateFilter}
                                        onChange={(e) => setDateFilter(e.target.value)}
                                        className="filter-date-input"
                                        min="2024-01-01"
                                        max="2030-12-31"
                                    />
                                </div>
                                <div className="filter-search">
                                    <Search size={15} className="filter-search-icon" />
                                    <input
                                        type="text"
                                        placeholder="Sipariş veya müşteri ara..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="filter-search-input"
                                    />
                                </div>
                                {hasActiveFilters && (
                                    <button className="filter-clear-btn" onClick={clearFilters} title="Filtreleri temizle">
                                        <X size={14} />
                                        Temizle
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Kanban Board */}
                        <div className="kanban-board">

                            {/* Column 1: Alındı */}
                            {visibleStatuses.includes('todo') && (
                                <div
                                    className="kanban-column"
                                    style={{ borderTop: '3px solid var(--status-todo)' }}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, 'todo')}
                                >
                                    <div className="column-header">
                                        <span>Sipariş Alındı</span>
                                        <span className="badge">{getFilteredOrdersByStatus('todo').length}</span>
                                    </div>
                                    {getFilteredOrdersByStatus('todo').map(order =>
                                        <OrderCard key={order.id} order={order} onDragStart={handleDragStart} onDrag={handleDrag} onDragEnd={handleDragEnd} onClick={() => { setEditingOrder(order); setIsModalOpen(true); }} onStatusChange={handleStatusChange} />
                                    )}
                                    {getFilteredOrdersByStatus('todo').length === 0 && (
                                        <div className="empty-column-msg">Sipariş bulunamadı</div>
                                    )}
                                </div>
                            )}

                            {/* Column 2: Yapılıyor */}
                            {visibleStatuses.includes('inprogress') && (
                                <div
                                    className="kanban-column"
                                    style={{ borderTop: '3px solid var(--status-inprogress)' }}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, 'inprogress')}
                                >
                                    <div className="column-header">
                                        <span>Baskıda</span>
                                        <span className="badge">{getFilteredOrdersByStatus('inprogress').length}</span>
                                    </div>
                                    {getFilteredOrdersByStatus('inprogress').map(order =>
                                        <OrderCard key={order.id} order={order} onDragStart={handleDragStart} onDrag={handleDrag} onDragEnd={handleDragEnd} onClick={() => { setEditingOrder(order); setIsModalOpen(true); }} onStatusChange={handleStatusChange} />
                                    )}
                                    {getFilteredOrdersByStatus('inprogress').length === 0 && (
                                        <div className="empty-column-msg">Sipariş bulunamadı</div>
                                    )}
                                </div>
                            )}

                            {/* Column 3: Bitti */}
                            {visibleStatuses.includes('done') && (
                                <div
                                    className="kanban-column"
                                    style={{ borderTop: '3px solid var(--status-done)' }}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, 'done')}
                                >
                                    <div className="column-header">
                                        <span>Pürüz / Teslime Hazır</span>
                                        <span className="badge">{getFilteredOrdersByStatus('done').length}</span>
                                    </div>
                                    {getFilteredOrdersByStatus('done').map(order =>
                                        <OrderCard key={order.id} order={order} onDragStart={handleDragStart} onDrag={handleDrag} onDragEnd={handleDragEnd} onClick={() => { setEditingOrder(order); setIsModalOpen(true); }} onStatusChange={handleStatusChange} />
                                    )}
                                    {getFilteredOrdersByStatus('done').length === 0 && (
                                        <div className="empty-column-msg">Sipariş bulunamadı</div>
                                    )}
                                </div>
                            )}

                            {/* Column 4: Teslim/Satıldı */}
                            {visibleStatuses.includes('delivered') && (
                                <div
                                    className="kanban-column"
                                    style={{ borderTop: '3px solid var(--status-delivered)' }}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, 'delivered')}
                                >
                                    <div className="column-header">
                                        <span>Teslim Edildi</span>
                                        <span className="badge">{getFilteredOrdersByStatus('delivered').length}</span>
                                    </div>
                                    {getFilteredOrdersByStatus('delivered').map(order =>
                                        <OrderCard key={order.id} order={order} onDragStart={handleDragStart} onDrag={handleDrag} onDragEnd={handleDragEnd} onClick={() => { setEditingOrder(order); setIsModalOpen(true); }} onStatusChange={handleStatusChange} />
                                    )}
                                    {getFilteredOrdersByStatus('delivered').length === 0 && (
                                        <div className="empty-column-msg">Sipariş bulunamadı</div>
                                    )}
                                </div>
                            )}

                        </div>
                    </>
                )}
            </main>
        </div>
    )
}

function OrderCard({
    order,
    onDragStart,
    onDrag,
    onDragEnd,
    onClick,
    onStatusChange,
    isGhost = false
}: {
    order: Order;
    onDragStart?: (e: React.DragEvent, order: Order) => void;
    onDrag?: (e: React.DragEvent) => void;
    onDragEnd?: (e: React.DragEvent) => void;
    onClick?: () => void;
    onStatusChange?: (orderId: string, newStatus: OrderStatus) => void;
    isGhost?: boolean;
}) {
    const currentIndex = statusFlow.indexOf(order.status);
    const prevStatus = currentIndex > 0 ? statusFlow[currentIndex - 1] : null;
    const nextStatus = currentIndex < statusFlow.length - 1 ? statusFlow[currentIndex + 1] : null;

    return (
        <div
            className="order-card"
            style={isGhost ? { opacity: 1, margin: 0, cursor: 'grabbing' } : undefined}
            draggable={!isGhost}
            onDragStart={(e) => onDragStart?.(e, order)}
            onDrag={onDrag}
            onDragEnd={onDragEnd}
            onClick={!isGhost ? onClick : undefined}
        >
            <div className="card-title">{order.title}</div>
            <div className="card-meta">
                <span>👤 {order.customer}</span>
                {order.color && <span>🎨 {order.color}</span>}
            </div>

            <div className="card-footer">
                <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                    {order.price ? <span title="Ücret" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: '#22c55e', fontWeight: 600 }}>💰 {order.price}₺</span> : null}
                    <span title="Baskı Süresi" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Clock size={14} /> {order.time}s</span>
                    <span title="Filament Gramajı" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Printer size={14} /> {order.weight}g</span>
                </div>
                {order.assignee && (
                    <div className="assignee-avatar" title={`Sorumlu: ${order.assignee}`}>
                        {order.assignee}
                    </div>
                )}
            </div>

            {/* Mobile status change buttons */}
            {!isGhost && onStatusChange && (
                <div className="mobile-status-actions">
                    {prevStatus && (
                        <button
                            className="status-btn status-btn-prev"
                            onClick={(e) => { e.stopPropagation(); onStatusChange(order.id, prevStatus); }}
                            title={`← ${statusLabels[prevStatus]}`}
                        >
                            <ChevronLeft size={14} />
                            {statusLabels[prevStatus]}
                        </button>
                    )}
                    {nextStatus && (
                        <button
                            className="status-btn status-btn-next"
                            onClick={(e) => { e.stopPropagation(); onStatusChange(order.id, nextStatus); }}
                            title={`${statusLabels[nextStatus]} →`}
                        >
                            {statusLabels[nextStatus]}
                            <ChevronRight size={14} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default App
