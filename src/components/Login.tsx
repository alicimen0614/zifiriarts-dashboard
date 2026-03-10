import React, { useState, useEffect } from 'react';
import { LogIn, AlertCircle } from 'lucide-react';
import { signInWithRedirect, setPersistence, browserLocalPersistence, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

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
    const [errorMsg, setErrorMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        import('firebase/auth').then(({ getRedirectResult }) => {
            getRedirectResult(auth).then((result) => {
                if (result) {
                    const userEmail = result.user.email;
                    if (userEmail && ALLOWED_EMAILS.includes(userEmail)) {
                        onLogin(userEmail);
                    } else {
                        signOut(auth);
                        setErrorMsg('Bu e-posta adresinin sisteme giriş yetkisi bulunmuyor.');
                    }
                }
            }).catch((err) => {
                console.error("Redirect login error", err);
                setErrorMsg('Google ile giriş yapılırken bir hata oluştu.');
            });
        });
    }, [onLogin]);

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        setErrorMsg('');

        try {
            await setPersistence(auth, browserLocalPersistence);

            // Using Redirect instead of Popup for iOS PWA compatibility
            await signInWithRedirect(auth, googleProvider);

        } catch (err: any) {
            console.error("Login failed", err);
            // Kapatma butonu veya ağ hatası
            if (err.code !== 'auth/popup-closed-by-user') {
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
                    <p className="text-secondary" style={{ marginTop: '0.5rem' }}>Ekip portalına hoş geldiniz. Devam etmek için yetkili Google hesabınızla giriş yapın.</p>
                </div>

                <div className="login-form" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    {errorMsg && (
                        <div style={{ color: '#ef4444', fontSize: '0.9rem', textAlign: 'center', marginBottom: '15px', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                            <AlertCircle size={16} />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        className="btn-primary w-full login-btn"
                        disabled={isLoading}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', backgroundColor: '#ffffff', color: '#1a1a1a', border: '1px solid #ddd' }}
                    >
                        {isLoading ? (
                            'Giriş Yapılıyor...'
                        ) : (
                            <>
                                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: '20px', height: '20px' }} />
                                Google ile Giriş Yap
                            </>
                        )}
                    </button>

                    <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#6ab0ff', marginTop: '20px', opacity: 0.8 }}>
                        Yetkisiz girişler otomatik loglanmaktadır.
                    </p>
                </div>
            </div>
        </div>
    );
}
