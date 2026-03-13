import React, { useState, useEffect } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot, getDocs } from 'firebase/firestore';
import type { Product } from './ProductsPage';

const FILAMENT_TYPES = [
    'PLA',
    'ABS',
    'PETG',
    'TPU',
    'ASA',
    'Reçine (Resin)',
];

interface TeamUser {
    id: string;
    email: string;
    displayName?: string;
}

interface Order {
    id: string;
    title: string;
    customer: string;
    status: string;
    weight: number;
    time: number;
    color?: string;
    assignee?: string;
    isAccountingized?: boolean;
}

interface OrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    editOrder?: Order | null;
}

export default function OrderModal({ isOpen, onClose, editOrder }: OrderModalProps) {
    const isEditMode = !!editOrder;

    const [title, setTitle] = useState('');
    const [customer, setCustomer] = useState('');
    const [color, setColor] = useState('PLA');
    const [weight, setWeight] = useState<number | ''>('');
    const [time, setTime] = useState<number | ''>('');
    const [price, setPrice] = useState<number | ''>('');
    const [assignee, setAssignee] = useState('');

    const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedProductId, setSelectedProductId] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Fetch team users from Firestore
    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
            const users = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as TeamUser[];
            setTeamUsers(users);
        });
        return () => unsubscribe();
    }, []);

    // Fetch products from Firestore
    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Product[];
            setProducts(data);
        });
        return () => unsubscribe();
    }, []);

    const isAccountingized = editOrder?.isAccountingized || false;

    // Pre-fill form when editing
    useEffect(() => {
        if (editOrder) {
            setTitle(editOrder.title || '');
            setCustomer(editOrder.customer || '');
            setColor(editOrder.color || 'PLA');
            setWeight(editOrder.weight || '');
            setTime(editOrder.time || '');
            setPrice((editOrder as any).price || '');
            setAssignee(editOrder.assignee || '');
            // Try to match existing product
            const matchingProduct = products.find(p => p.name === editOrder.title);
            setSelectedProductId(matchingProduct?.id || 'custom');
        } else {
            // Reset for new order
            setTitle('');
            setCustomer('');
            setColor('PLA');
            setWeight('');
            setTime('');
            setPrice('');
            setAssignee('');
            setSelectedProductId('');
        }
    }, [editOrder, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !customer) return;

        setIsSaving(true);
        try {
            const orderData = {
                title,
                customer,
                color,
                weight: Number(weight) || 0,
                time: Number(time) || 0,
                price: Number(price) || 0,
                assignee,
            };

            if (isEditMode && editOrder) {
                // Update existing order
                const orderRef = doc(db, 'orders', editOrder.id);
                await updateDoc(orderRef, orderData);
            } else {
                // Create new order
                await addDoc(collection(db, 'orders'), {
                    ...orderData,
                    status: 'todo',
                    createdAt: serverTimestamp()
                });

                // Trigger Push Notification
                try {
                    // Notify other team members via fcm_tokens collection
                    const tokensSnapshot = await getDocs(collection(db, 'fcm_tokens'));
                    const tokenSet = new Set<string>();
                    tokensSnapshot.forEach(docSnap => {
                        const tokenData = docSnap.data().token;
                        if (tokenData) tokenSet.add(tokenData);
                    });
                    const tokens = Array.from(tokenSet);

                    if (tokens.length > 0) {
                        // Call our Netlify Serverless Function
                        // In local dev, this will hit localhost:8888 if using netlify dev, 
                        // or it works relative to the domain in production.
                        console.log(`Sending notification to ${tokens.length} tokens via Cloudflare`);
                        const response = await fetch('/api/send-notification', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                title: 'Yeni Sipariş!',
                                message: `${customer} kişisinden ${title} siparişi eklendi.`,
                                tokens: tokens
                            })
                        });
                        const result = await response.json();
                        console.log("Notification result:", result);
                    } else {
                        console.warn("No FCM tokens found in database.");
                    }
                } catch (notifyErr) {
                    console.error("Bildirim gönderme hatası:", notifyErr);
                    // We don't want notification failure to break order creation UI
                }
            }

            onClose();
        } catch (error) {
            console.error("Sipariş kaydedilirken hata:", error);
            alert("İşlem başarısız, lütfen tekrar deneyin.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!editOrder) return;
        if (!confirm('Bu siparişi silmek istediğinize emin misiniz?')) return;

        setIsDeleting(true);
        try {
            await deleteDoc(doc(db, 'orders', editOrder.id));
            onClose();
        } catch (error) {
            console.error("Sipariş silinirken hata:", error);
            alert("Silme işlemi başarısız.");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-panel animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{isEditMode ? 'Siparişi Düzenle' : 'Yeni Sipariş Ekle'}</h2>
                    <button onClick={onClose} className="btn-icon">
                        <X size={20} />
                    </button>
                </div>

                {isAccountingized && (
                    <div className="alert alert-warning" style={{ margin: '1rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', color: '#f59e0b', fontSize: '0.85rem' }}>
                        ⚠️ Bu sipariş muhasebeleştirildiği için bilgiler değiştirilemez.
                    </div>
                )}

                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-group">
                        <label>Ürün Seç <span className="text-danger">*</span></label>
                        <select
                            disabled={isSaving || isDeleting || isAccountingized}
                            value={selectedProductId}
                            onChange={e => {
                                const pid = e.target.value;
                                setSelectedProductId(pid);
                                if (pid && pid !== 'custom') {
                                    const product = products.find(p => p.id === pid);
                                    if (product) {
                                        setTitle(product.name);
                                        if (product.defaultWeight) setWeight(product.defaultWeight);
                                        if (product.defaultTime) setTime(product.defaultTime);
                                        if (product.defaultPrice) setPrice(product.defaultPrice);
                                    }
                                } else if (pid === 'custom') {
                                    setTitle('');
                                }
                            }}
                        >
                            <option value="">Ürün seçin...</option>
                            {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                            <option value="custom">✓ Özel Giriş (Elle Yaz)</option>
                        </select>
                    </div>

                    {selectedProductId === 'custom' && (
                        <div className="form-group">
                            <label>Sipariş Adı / Model <span className="text-danger">*</span></label>
                            <input
                                type="text"
                                required
                                disabled={isSaving || isDeleting || isAccountingized}
                                placeholder="Örn: Iron Man Kaskı"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label>Müşteri Adı <span className="text-danger">*</span></label>
                        <input
                            type="text"
                            required
                            disabled={isSaving || isDeleting || isAccountingized}
                            placeholder="Müşteri ad soyad veya firma"
                            value={customer}
                            onChange={e => setCustomer(e.target.value)}
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Filament Türü</label>
                            <select
                                disabled={isSaving || isDeleting || isAccountingized}
                                value={color}
                                onChange={e => setColor(e.target.value)}
                            >
                                {FILAMENT_TYPES.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Sorumlu Kişi</label>
                            <select
                                disabled={isSaving || isDeleting || isAccountingized}
                                value={assignee}
                                onChange={e => setAssignee(e.target.value)}
                            >
                                <option value="">Atanmamış</option>
                                {teamUsers.map(user => (
                                    <option key={user.id} value={user.displayName || user.email}>
                                        {user.displayName || user.email}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Tahmini Ağırlık (Gram)</label>
                            <input
                                type="number"
                                min="0"
                                disabled={isSaving || isDeleting || isAccountingized}
                                placeholder="Örn: 250"
                                value={weight}
                                onChange={e => setWeight(Number(e.target.value))}
                            />
                        </div>
                        <div className="form-group">
                            <label>Baskı Süresi (Saat)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.5"
                                disabled={isSaving || isDeleting || isAccountingized}
                                placeholder="Örn: 14.5"
                                value={time}
                                onChange={e => setTime(Number(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Ücret (₺)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={isSaving || isDeleting || isAccountingized}
                            placeholder="Örn: 150"
                            value={price}
                            onChange={e => setPrice(Number(e.target.value))}
                        />
                    </div>

                    <div className="modal-actions">
                        {isEditMode && !isAccountingized && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isDeleting || isSaving}
                                className="btn-danger"
                            >
                                <Trash2 size={16} /> {isDeleting ? 'Siliniyor...' : 'Sil'}
                            </button>
                        )}
                        <div style={{ flex: 1 }} />
                        <button type="button" onClick={onClose} disabled={isSaving || isDeleting} className="btn-secondary">İptal</button>
                        {!isAccountingized && (
                            <button type="submit" disabled={isSaving || isDeleting} className="btn-primary">
                                {isSaving ? "Kaydediliyor..." : <><Save size={16} /> Kaydet</>}
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}
