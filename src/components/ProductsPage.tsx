import React, { useState, useEffect } from 'react';
import { PlusCircle, Trash2, X, Save, Package, ImagePlus } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp } from 'firebase/firestore';

export interface Product {
    id: string;
    name: string;
    description?: string;
    defaultWeight?: number;
    defaultTime?: number;
    defaultPrice?: number;
    imageBase64?: string;
    createdAt?: any;
}

export default function ProductsPage({ onAddProduct, onEditProduct }: { onAddProduct: () => void; onEditProduct: (product: Product) => void }) {
    const [products, setProducts] = useState<Product[]>([]);

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

    const handleDelete = async (e: React.MouseEvent, productId: string) => {
        e.stopPropagation();
        if (!confirm('Bu ürünü silmek istediğinize emin misiniz?')) return;
        try {
            await deleteDoc(doc(db, 'products', productId));
        } catch (error) {
            console.error('Ürün silme hatası:', error);
        }
    };

    return (
        <div>
            <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2>Ürünler</h2>
                    <p className="text-secondary">3D baskı ürünlerinizi yönetin.</p>
                </div>
                <button className="btn-primary" onClick={onAddProduct}>
                    <PlusCircle size={18} />
                    Yeni Ürün
                </button>
            </div>

            {products.length === 0 ? (
                <div className="products-empty">
                    <Package size={48} />
                    <p>Henüz ürün eklenmemiş</p>
                    <button className="btn-primary" onClick={onAddProduct}>
                        <PlusCircle size={16} /> İlk Ürünü Ekle
                    </button>
                </div>
            ) : (
                <div className="products-grid">
                    {products.map(product => (
                        <div key={product.id} className="product-card" onClick={() => onEditProduct(product)} style={{ cursor: 'pointer' }}>
                            <div className="product-image">
                                {product.imageBase64 ? (
                                    <img src={product.imageBase64} alt={product.name} />
                                ) : (
                                    <div className="product-image-placeholder">
                                        <Package size={32} />
                                    </div>
                                )}
                            </div>
                            <div className="product-info">
                                <h3 className="product-name">{product.name}</h3>
                                {product.description && (
                                    <p className="product-desc">{product.description}</p>
                                )}
                                <div className="product-meta">
                                    {product.defaultPrice ? <span>💰 {product.defaultPrice}₺</span> : null}
                                    {product.defaultWeight ? <span>⚖️ {product.defaultWeight}g</span> : null}
                                    {product.defaultTime ? <span>🕐 {product.defaultTime}s</span> : null}
                                </div>
                            </div>
                            <button
                                className="product-delete-btn"
                                onClick={(e) => handleDelete(e, product.id)}
                                title="Ürünü Sil"
                            >
                                <Trash2 size={15} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

        </div>
    );
}

export function ProductModal({ onClose, editProduct }: { onClose: () => void; editProduct?: Product | null }) {
    const isEditMode = !!editProduct;

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [defaultWeight, setDefaultWeight] = useState<number | ''>('');
    const [defaultTime, setDefaultTime] = useState<number | ''>('');
    const [defaultPrice, setDefaultPrice] = useState<number | ''>('');
    const [imageBase64, setImageBase64] = useState('');
    const [imagePreview, setImagePreview] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Pre-fill when editing
    useEffect(() => {
        if (editProduct) {
            setName(editProduct.name || '');
            setDescription(editProduct.description || '');
            setDefaultWeight(editProduct.defaultWeight || '');
            setDefaultTime(editProduct.defaultTime || '');
            setDefaultPrice(editProduct.defaultPrice || '');
            setImageBase64(editProduct.imageBase64 || '');
            setImagePreview(editProduct.imageBase64 || '');
        }
    }, [editProduct]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Max 500KB for Firestore doc limit
        if (file.size > 500 * 1024) {
            alert('Fotoğraf boyutu çok büyük. Lütfen 500KB altında bir fotoğraf seçin.');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result as string;
            setImageBase64(base64);
            setImagePreview(base64);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSaving(true);
        try {
            const productData = {
                name: name.trim(),
                description: description.trim() || null,
                defaultWeight: Number(defaultWeight) || 0,
                defaultTime: Number(defaultTime) || 0,
                defaultPrice: Number(defaultPrice) || 0,
                imageBase64: imageBase64 || null,
            };

            if (isEditMode && editProduct) {
                const productRef = doc(db, 'products', editProduct.id);
                await updateDoc(productRef, productData);
            } else {
                await addDoc(collection(db, 'products'), {
                    ...productData,
                    createdAt: serverTimestamp()
                });
            }
            onClose();
        } catch (error) {
            console.error('Ürün kaydedilirken hata:', error);
            alert('Ürün kaydedilemedi, lütfen tekrar deneyin.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-panel animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{isEditMode ? 'Ürünü Düzenle' : 'Yeni Ürün Ekle'}</h2>
                    <button onClick={onClose} className="btn-icon">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-form">
                    {/* Photo Upload */}
                    <div className="form-group">
                        <label>Ürün Fotoğrafı</label>
                        <div className="photo-upload-area">
                            {imagePreview ? (
                                <div className="photo-preview">
                                    <img src={imagePreview} alt="Önizleme" />
                                    <button type="button" className="photo-remove" onClick={() => { setImageBase64(''); setImagePreview(''); }} disabled={isSaving}>
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <label className="photo-upload-label" style={{ opacity: isSaving ? 0.5 : 1, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
                                    <ImagePlus size={24} />
                                    <span>Fotoğraf Seç</span>
                                    <span className="text-secondary" style={{ fontSize: '0.7rem' }}>Max 500KB</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageChange}
                                        style={{ display: 'none' }}
                                        disabled={isSaving}
                                    />
                                </label>
                            )}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Ürün Adı <span className="text-danger">*</span></label>
                        <input
                            type="text"
                            required
                            placeholder="Örn: Iron Man Kaskı"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            disabled={isSaving}
                        />
                    </div>

                    <div className="form-group">
                        <label>Açıklama</label>
                        <input
                            type="text"
                            placeholder="Kısa açıklama (opsiyonel)"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            disabled={isSaving}
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Varsayılan Ağırlık (g)</label>
                            <input
                                type="number"
                                min="0"
                                placeholder="Örn: 250"
                                value={defaultWeight}
                                onChange={e => setDefaultWeight(Number(e.target.value))}
                                disabled={isSaving}
                            />
                        </div>
                        <div className="form-group">
                            <label>Varsayılan Süre (Saat)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.5"
                                placeholder="Örn: 14.5"
                                value={defaultTime}
                                onChange={e => setDefaultTime(Number(e.target.value))}
                                disabled={isSaving}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Varsayılan Fiyat (₺)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Örn: 150"
                            value={defaultPrice}
                            onChange={e => setDefaultPrice(Number(e.target.value))}
                            disabled={isSaving}
                        />
                    </div>

                    <div className="modal-actions">
                        <div style={{ flex: 1 }} />
                        <button type="button" onClick={onClose} className="btn-secondary" disabled={isSaving}>İptal</button>
                        <button type="submit" disabled={isSaving} className="btn-primary">
                            {isSaving ? "Kaydediliyor..." : <><Save size={16} /> {isEditMode ? 'Güncelle' : 'Kaydet'}</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
