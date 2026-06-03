import { useState, useEffect, useRef } from 'react';
import { Save, Store, Bell, Shield, Eye, EyeOff, Loader2, KeyRound, Stethoscope, Plus, Trash2, ImagePlus, X, Film, Play } from 'lucide-react';
import { toast } from 'sonner';
import { adminGet, adminPatch, adminPost, adminUploadImage, adminUploadVideo, adminDeleteUpload } from '@/services/adminApiService';

interface SettingsData {
  nom: string;
  email: string;
  tel: string;
  adresse: string;
  ouverture: string;
  fermeture: string;
  devise: string;
  notifEmail: boolean;
  notifWhatsApp: boolean;
  notifSms: boolean;
  dieteticienNom: string;
  dieteticienTitre: string;
  dieteticienBio: string;
  dieteticienExperience: string;
  dieteticienCredentials: string[];
  dieteticienPhoto: string;
  videoPresentation: string;
}

const DEFAULTS: SettingsData = {
  nom: 'La Délicieuse Diète',
  email: 'ladelicieuse.1@gmail.com',
  tel: '+241 76 35 90 20',
  adresse: 'Quartier Louis, Libreville, Gabon',
  ouverture: '08:00',
  fermeture: '21:00',
  devise: 'FCFA',
  notifEmail: true,
  notifWhatsApp: true,
  notifSms: false,
  dieteticienNom: 'Dr. Carlos BATTY',
  dieteticienTitre: 'Diététicien nutritionniste',
  dieteticienBio: '',
  dieteticienExperience: '10+',
  dieteticienCredentials: [],
  dieteticienPhoto: '',
  videoPresentation: '',
};

// ─── Sub-components at module level (never re-created on render) ──────────────

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-background border border-border rounded-lg p-6 hover:shadow-md transition-shadow duration-300">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <h3 className="font-display text-lg text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InputField({
  label, value, onChange, type = 'text', disabled,
}: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; disabled?: boolean;
}) {
  return (
    <div>
      <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full h-10 px-4 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
      />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="font-body text-sm text-foreground">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-10 h-5 rounded-full transition-colors relative ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsData>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [photoPreview, setPhotoPreview] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoFile = async (file: File) => {
    setPhotoPreview(URL.createObjectURL(file));
    setUploadingPhoto(true);
    try {
      const url = await adminUploadImage(file);
      setForm(f => ({ ...f, dieteticienPhoto: url }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur upload photo');
      setPhotoPreview('');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── Vidéo de présentation ──────────────────────────────────────────────────
  const [videoPreview, setVideoPreview] = useState('');
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const videoInputRef = useRef<HTMLInputElement>(null);
  // Garde la dernière URL sauvegardée pour suppression propre après remplacement
  const savedVideoUrlRef = useRef<string>('');

  const handleVideoFile = async (file: File) => {
    const MAX_SIZE = 200 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error('La vidéo dépasse la taille maximale autorisée (200 Mo).');
      return;
    }
    setVideoPreview(URL.createObjectURL(file));
    setUploadingVideo(true);
    setUploadProgress(0);
    try {
      const url = await adminUploadVideo(file, (pct) => setUploadProgress(pct));
      setForm(f => ({ ...f, videoPresentation: url }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur upload vidéo');
      setVideoPreview(form.videoPresentation ? `${window.location.origin.replace('5100', '3000')}${form.videoPresentation}` : '');
    } finally {
      setUploadingVideo(false);
      setUploadProgress(0);
    }
  };

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwForm, setPwForm] = useState({ motDePasseActuel: '', nouveauMotDePasse: '', confirmation: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    adminGet<{ success: boolean; data: SettingsData }>('/settings')
      .then(res => {
        const merged = { ...DEFAULTS, ...res.data };
        setForm(merged);
        if (merged.dieteticienPhoto) setPhotoPreview(merged.dieteticienPhoto);
        if (merged.videoPresentation) {
          setVideoPreview(merged.videoPresentation);
          savedVideoUrlRef.current = merged.videoPresentation;
        }
      })
      .catch(() => toast.error('Impossible de charger les paramètres'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const oldVideoUrl = savedVideoUrlRef.current;
    try {
      await adminPatch('/settings', {
        nom:                    form.nom,
        email:                  form.email,
        tel:                    form.tel,
        adresse:                form.adresse,
        ouverture:              form.ouverture,
        fermeture:              form.fermeture,
        devise:                 form.devise,
        notifEmail:             form.notifEmail,
        notifWhatsApp:          form.notifWhatsApp,
        notifSms:               form.notifSms,
        dieteticienNom:         form.dieteticienNom,
        dieteticienTitre:       form.dieteticienTitre,
        dieteticienBio:         form.dieteticienBio,
        dieteticienExperience:  form.dieteticienExperience,
        dieteticienCredentials: form.dieteticienCredentials,
        dieteticienPhoto:       form.dieteticienPhoto,
        videoPresentation:      form.videoPresentation,
      });
      // Supprimer l'ancienne vidéo après sauvegarde réussie du nouveau chemin
      if (oldVideoUrl && oldVideoUrl !== form.videoPresentation) {
        adminDeleteUpload(oldVideoUrl); // fire-and-forget
      }
      savedVideoUrlRef.current = form.videoPresentation;
      toast.success('Paramètres enregistrés avec succès !');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!pwForm.motDePasseActuel || !pwForm.nouveauMotDePasse) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }
    if (pwForm.nouveauMotDePasse !== pwForm.confirmation) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    if (pwForm.nouveauMotDePasse.length < 8) {
      toast.error('Le nouveau mot de passe doit contenir au moins 8 caractères');
      return;
    }
    setSavingPw(true);
    try {
      await adminPost('/settings/password', {
        motDePasseActuel: pwForm.motDePasseActuel,
        nouveauMotDePasse: pwForm.nouveauMotDePasse,
      });
      toast.success('Mot de passe mis à jour avec succès');
      setShowPasswordModal(false);
      setPwForm({ motDePasseActuel: '', nouveauMotDePasse: '', confirmation: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingPw(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Paramètres</h2>
          <p className="font-body text-sm text-muted-foreground">Configuration de la plateforme</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Section icon={Store} title="Informations du restaurant">
          <div className="space-y-4">
            <InputField label="Nom du restaurant" value={form.nom} onChange={v => setForm(f => ({ ...f, nom: v }))} />
            <InputField label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} type="email" />
            <InputField label="Téléphone" value={form.tel} onChange={v => setForm(f => ({ ...f, tel: v }))} />
            <InputField label="Adresse" value={form.adresse} onChange={v => setForm(f => ({ ...f, adresse: v }))} />
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Ouverture" value={form.ouverture} onChange={v => setForm(f => ({ ...f, ouverture: v }))} type="time" />
              <InputField label="Fermeture" value={form.fermeture} onChange={v => setForm(f => ({ ...f, fermeture: v }))} type="time" />
            </div>
          </div>
        </Section>

        <Section icon={Bell} title="Notifications">
          <div className="space-y-1">
            <Toggle label="Notifications par email" checked={form.notifEmail} onChange={v => setForm(f => ({ ...f, notifEmail: v }))} />
            <Toggle label="Notifications WhatsApp" checked={form.notifWhatsApp} onChange={v => setForm(f => ({ ...f, notifWhatsApp: v }))} />
            <Toggle label="Notifications SMS" checked={form.notifSms} onChange={v => setForm(f => ({ ...f, notifSms: v }))} />
          </div>
        </Section>

        <Section icon={Shield} title="Sécurité">
          <div className="space-y-3">
            <button
              onClick={() => setShowPasswordModal(true)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-muted rounded-md font-body text-sm text-foreground hover:bg-muted/80 transition-colors text-left"
            >
              <KeyRound className="w-4 h-4 text-primary" />
              Changer le mot de passe administrateur
            </button>
            <p className="font-body text-xs text-muted-foreground px-1">
              Le mot de passe est stocké de manière sécurisée (bcrypt). Après un premier changement, la valeur par défaut du fichier .env n'est plus utilisée.
            </p>
          </div>
        </Section>
      </div>

      {/* Profil diététicien — pleine largeur */}
      <Section icon={Stethoscope} title="Profil du diététicien">
        <div className="grid md:grid-cols-2 gap-4">
          <InputField label="Nom complet" value={form.dieteticienNom} onChange={v => setForm(f => ({ ...f, dieteticienNom: v }))} />
          <InputField label="Titre" value={form.dieteticienTitre} onChange={v => setForm(f => ({ ...f, dieteticienTitre: v }))} />
          <InputField label="Années d'expérience" value={form.dieteticienExperience} onChange={v => setForm(f => ({ ...f, dieteticienExperience: v }))} />

          {/* Upload photo */}
          <div>
            <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Photo</label>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) handlePhotoFile(e.target.files[0]); }}
            />
            {photoPreview ? (
              <div className="relative w-full h-40 rounded-lg overflow-hidden border border-border">
                <img src={photoPreview} alt="Aperçu" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setPhotoPreview('');
                    setForm(f => ({ ...f, dieteticienPhoto: '' }));
                    if (photoInputRef.current) photoInputRef.current.value = '';
                  }}
                  className="absolute top-2 right-2 p-1 bg-foreground/70 text-background rounded-full hover:bg-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                {uploadingPhoto && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="w-full h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <ImagePlus className="w-7 h-7" />
                <span className="font-body text-xs">Cliquer pour ajouter une photo</span>
                <span className="font-body text-xs opacity-60">JPEG, PNG, WebP · max 5 Mo</span>
              </button>
            )}
          </div>
          <div className="md:col-span-2">
            <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Biographie</label>
            <textarea
              value={form.dieteticienBio}
              onChange={e => setForm(f => ({ ...f, dieteticienBio: e.target.value }))}
              rows={3}
              className="w-full px-4 py-2 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
          <div className="md:col-span-2">
            <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">
              Certifications / Diplômes
            </label>
            <div className="space-y-2">
              {form.dieteticienCredentials.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={c}
                    onChange={e => {
                      const next = [...form.dieteticienCredentials];
                      next[i] = e.target.value;
                      setForm(f => ({ ...f, dieteticienCredentials: next }));
                    }}
                    className="flex-1 h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    onClick={() => setForm(f => ({ ...f, dieteticienCredentials: f.dieteticienCredentials.filter((_, j) => j !== i) }))}
                    className="p-2 rounded-md hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setForm(f => ({ ...f, dieteticienCredentials: [...f.dieteticienCredentials, ''] }))}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded-md font-body text-xs hover:bg-border transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Ajouter une certification
              </button>
            </div>
          </div>
        </div>
      </Section>

      {/* Vidéo de présentation — pleine largeur */}
      <Section icon={Film} title="Vidéo de présentation — « Comment ça se passe chez nous »">
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleVideoFile(e.target.files[0]); }}
        />
        {videoPreview ? (
          <div className="space-y-3">
            <div className="relative w-full rounded-lg overflow-hidden border border-border bg-black aspect-video">
              <video
                src={videoPreview}
                controls
                preload="metadata"
                className="w-full h-full"
              />
              {uploadingVideo && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 gap-3 p-6">
                  <div className="w-full max-w-xs bg-border rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="font-body text-sm text-foreground">
                    Envoi en cours… {uploadProgress}%
                  </span>
                </div>
              )}
              {!uploadingVideo && (
                <button
                  type="button"
                  onClick={() => {
                    setVideoPreview('');
                    setForm(f => ({ ...f, videoPresentation: '' }));
                    if (videoInputRef.current) videoInputRef.current.value = '';
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-foreground/70 text-background rounded-full hover:bg-foreground transition-colors"
                  title="Supprimer la vidéo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {!uploadingVideo && (
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-muted border border-border rounded-md font-body text-sm hover:bg-border transition-colors"
              >
                <Play className="w-4 h-4 text-primary" />
                Remplacer la vidéo
              </button>
            )}
            <p className="font-body text-xs text-muted-foreground">
              MP4, WebM, MOV · 200 Mo maximum · La vidéo actuelle sera remplacée après enregistrement.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="w-full h-40 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-3 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Film className="w-8 h-8" />
              <div className="text-center">
                <span className="font-body text-sm block">Cliquer pour ajouter une vidéo</span>
                <span className="font-body text-xs opacity-60">MP4, WebM, MOV · max 200 Mo</span>
              </div>
            </button>
            <p className="font-body text-xs text-muted-foreground px-1">
              Seul l'upload direct de fichier est autorisé. Les liens YouTube, Vimeo ou externes ne sont pas acceptés.
            </p>
          </div>
        )}
      </Section>

      {/* Password modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-6 space-y-5">
            <h3 className="font-display text-xl text-foreground">Changer le mot de passe</h3>

            <div className="space-y-4">
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Mot de passe actuel</label>
                <div className="relative">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={pwForm.motDePasseActuel}
                    onChange={e => setPwForm(f => ({ ...f, motDePasseActuel: e.target.value }))}
                    className="w-full h-10 pl-4 pr-10 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Nouveau mot de passe</label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={pwForm.nouveauMotDePasse}
                    onChange={e => setPwForm(f => ({ ...f, nouveauMotDePasse: e.target.value }))}
                    className="w-full h-10 pl-4 pr-10 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {pwForm.nouveauMotDePasse && pwForm.nouveauMotDePasse.length < 8 && (
                  <p className="font-body text-xs text-destructive mt-1">Au moins 8 caractères requis</p>
                )}
              </div>

              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Confirmer le nouveau mot de passe</label>
                <input
                  type="password"
                  value={pwForm.confirmation}
                  onChange={e => setPwForm(f => ({ ...f, confirmation: e.target.value }))}
                  className="w-full h-10 px-4 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {pwForm.confirmation && pwForm.confirmation !== pwForm.nouveauMotDePasse && (
                  <p className="font-body text-xs text-destructive mt-1">Les mots de passe ne correspondent pas</p>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowPasswordModal(false); setPwForm({ motDePasseActuel: '', nouveauMotDePasse: '', confirmation: '' }); }}
                className="flex-1 h-10 border border-border rounded-md font-body text-sm text-foreground hover:bg-muted transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handlePasswordChange}
                disabled={savingPw}
                className="flex-1 h-10 bg-primary text-primary-foreground rounded-md font-body text-sm hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {savingPw && <Loader2 className="w-4 h-4 animate-spin" />}
                {savingPw ? 'Mise à jour…' : 'Mettre à jour'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
