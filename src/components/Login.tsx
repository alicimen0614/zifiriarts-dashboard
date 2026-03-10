import React, { useState } from 'react';
import { LogIn, AlertCircle, KeyRound, Mail } from 'lucide-react';
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';

interface LoginProps {
    onLogin: (email: string) => void;
}

// BEYAZ LİSTE (Yetkili E-posta Adresleri)
// Sistemi kullanabilecek 4 arkadaşınızın ve sizin e-posta adreslerinizi buraya ekleyin.
const ALLOWED_EMAILS = [
    'alicimen0614@gmail.com',
    'salihcigdem14@gmail.com',
    'adilcigdem14@gmail.com',
    'fantasynwp@gmail.com'
];

export default function Login({ onLogin }: LoginProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email.trim() || !password.trim()) {
            setErrorMsg('Lütfen e-posta ve şifrenizi girin.');
            return;
        }

        setIsLoading(true);
        setErrorMsg('');

        try {
            await setPersistence(auth, browserLocalPersistence);

            const result = await signInWithEmailAndPassword(auth, email.trim(), password);
            const userEmail = result.user.email;

            // Whitelist Kontrolü
            if (userEmail && ALLOWED_EMAILS.includes(userEmail)) {
                onLogin(userEmail);
            } else {
                // Listede yoksa anında çıkış yaptır
                await signOut(auth);
                setErrorMsg('Bu e-posta adresinin sisteme giriş yetkisi bulunmuyor.');
            }

        } catch (err: any) {
            console.error("Login failed", err);

            // Firebase Auth error handling
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                setErrorMsg('E-posta adresi veya şifre hatalı.');
            } else if (err.code === 'auth/invalid-email') {
                setErrorMsg('Geçersiz bir e-posta formatı.');
            } else {
                setErrorMsg('Giriş başarısız. Lütfen tekrar deneyin.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex-center bg-dark">
            <div className="login-card glass-panel animate-fade-in" style={{ maxWidth: '400px' }}>
                <div className="login-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <img src="/logo.jpg" alt="ZifiriArts Logo" className="login-logo" style={{ marginBottom: '1rem' }} />
                    <h2>Zifiri Sistemine Giriş</h2>
                    <p className="text-secondary" style={{ marginTop: '0.5rem' }}>Ekip portalına hoş geldiniz. Sistemdeki hesabınızla giriş yapın.</p>
                </div>

                <form onSubmit={handleEmailLogin} className="login-form" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    {errorMsg && (
                        <div style={{ color: '#ef4444', fontSize: '0.9rem', textAlign: 'center', marginBottom: '15px', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                            <AlertCircle size={16} />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    <div className="form-group" style={{ width: '100%', marginBottom: '15px' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <Mail size={18} style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)' }} />
                            <input
                                type="email"
                                placeholder="E-posta Adresi"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-primary)' }}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group" style={{ width: '100%', marginBottom: '20px' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <KeyRound size={18} style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)' }} />
                            <input
                                type="password"
                                placeholder="Şifre"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-primary)' }}
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn-primary w-full login-btn"
                        disabled={isLoading}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                    >
                        {isLoading ? (
                            'Giriş Yapılıyor...'
                        ) : (
                            <>
                                <LogIn size={18} />
                                Giriş Yap
                            </>
                        )}
                    </button>

                    <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#6ab0ff', marginTop: '20px', opacity: 0.8 }}>
                        Yetkisiz girişler otomatik loglanmaktadır.
                    </p>
                </form>
            </div>
        </div>
    );
}
