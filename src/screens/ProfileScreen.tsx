import { useRef, useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { UserAvatar } from '../components/UserAvatar';
import { uploadAvatarApi, removeAvatarApi } from '../api/auth';
import { resizeImageToDataUrl } from '../utils/imageResize';
import { Camera, Trash2 } from 'lucide-react';

export function ProfileScreen() {
  const { setPhase } = useGame();
  const { user, logout, updateUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  useEffect(() => {
    if (!user) setPhase('home');
  }, [user, setPhase]);

  if (!user) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarError('Choisis une image (JPEG, PNG ou WebP).');
      return;
    }
    setAvatarError('');
    setUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const updated = await uploadAvatarApi(dataUrl);
      updateUser(updated);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Erreur lors du téléversement');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarError('');
    setUploading(true);
    try {
      const updated = await removeAvatarApi();
      updateUser(updated);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Layout title="Mon profil" onBack={() => setPhase('home')} backLabel="Accueil">
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col items-center gap-4">
          <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size="xl" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex flex-wrap gap-2 justify-center">
            <Button
              variant="secondary"
              size="md"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="w-4 h-4" />
              {uploading ? 'Envoi…' : 'Changer la photo'}
            </Button>
            {user.avatarUrl && (
              <Button
                variant="ghost"
                size="md"
                disabled={uploading}
                onClick={handleRemoveAvatar}
              >
                <Trash2 className="w-4 h-4" />
                Photo par défaut
              </Button>
            )}
          </div>
          {avatarError && (
            <p className="text-rose-600 dark:text-rose-400 text-sm text-center">{avatarError}</p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
            Pseudo
          </p>
          <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            {user.username}
          </p>
        </div>
        <Button
          fullWidth
          variant="secondary"
          onClick={() => {
            logout();
            setPhase('home');
          }}
        >
          Se déconnecter
        </Button>
        <Button
          fullWidth
          variant="ghost"
          onClick={() => setPhase('friends')}
        >
          Mes amis
        </Button>
      </div>
    </Layout>
  );
}
