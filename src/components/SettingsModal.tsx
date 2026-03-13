import React, { useState, useEffect } from 'react';
import { X, Save, ShieldCheck } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';

interface TeamUser {
    uid: string;
    email: string;
    displayName?: string;
}

interface SettingsModalProps {
    onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
    const [users, setUsers] = useState<TeamUser[]>([]);
    const [selectedUid, setSelectedUid] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [currentSorumlu, setCurrentSorumlu] = useState<any>(null);

    useEffect(() => {
        // Fetch users
        const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
            const usersData = snapshot.docs.map(doc => ({
                uid: doc.id,
                ...doc.data()
            })) as TeamUser[];
            setUsers(usersData);
        });

        // Fetch current settings
        const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                if (data.kasaSorumlusu) {
                    setCurrentSorumlu(data.kasaSorumlusu);
                    setSelectedUid(data.kasaSorumlusu.uid);
                }
            }
        });

        return () => {
            unsubscribeUsers();
            unsubscribeSettings();
        };
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const selectedUser = users.find(u => u.uid === selectedUid);
            if (!selectedUser) {
                // Remove cashier
                await setDoc(doc(db, 'settings', 'global'), { kasaSorumlusu: null }, { merge: true });
            } else {
                await setDoc(doc(db, 'settings', 'global'), {
                    kasaSorumlusu: {
                        uid: selectedUser.uid,
                        email: selectedUser.email,
                        displayName: selectedUser.displayName || selectedUser.email.split('@')[0]
                    }
                }, { merge: true });
            }
            onClose();
        } catch (error) {
            console.error('Settings save error:', error);
            alert('Ayarlar kaydedilirken bir hata oluştu.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-panel animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                <div className="modal-header">
                    <h2>Sistem Ayarları</h2>
                    <button onClick={onClose} className="btn-icon">
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-form">
                    <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ShieldCheck size={18} className="text-accent" />
                            Kasa Sorumlusu Seçin
                        </label>
                        <p className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                            Seçilen kullanıcı kasaya aktarılan tüm ödemeleri onaylamakla sorumlu olacaktır.
                        </p>
                        <select
                            value={selectedUid}
                            onChange={e => setSelectedUid(e.target.value)}
                            disabled={isSaving}
                        >
                            <option value="">Sorumlu Yok (Direkt Geçiş)</option>
                            {users.map(user => (
                                <option key={user.uid} value={user.uid}>
                                    {user.displayName || user.email}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="modal-actions">
                        <div style={{ flex: 1 }} />
                        <button type="button" onClick={onClose} className="btn-secondary" disabled={isSaving}>İptal</button>
                        <button
                            type="button"
                            onClick={handleSave}
                            className="btn-primary"
                            disabled={isSaving}
                        >
                            <Save size={16} /> {isSaving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
