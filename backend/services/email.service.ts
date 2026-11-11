import nodemailer from 'nodemailer';
import { primaryFrontendUrl } from '../config/frontendUrl.js';

// Google affiche le mot de passe d'application en quatre groupes séparés par des espaces ; SMTP l'attend sans espaces.
export const normalizeAppPassword = (raw: string | undefined): string | undefined => raw?.replace(/\s+/g, '');

// ── Singleton SMTP ────────────────────────────────────────────────────────────
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port:   Number(process.env.SMTP_PORT ?? 465),
      secure: (process.env.SMTP_PORT ?? '465') !== '587',
      auth: {
        user: process.env.EMAIL_USER,
        pass: normalizeAppPassword(process.env.EMAIL_APP_PASSWORD),
      },
      pool:           true,
      maxConnections: 3,
      // Sans ces bornes, un SMTP injoignable bloque la requête ~2 min (défaut nodemailer).
      connectionTimeout: 10_000,
      greetingTimeout:   10_000,
      socketTimeout:     20_000,
    }) as nodemailer.Transporter;
  }
  return _transporter!;
}

// ── Palette La Délicieuse Diète ───────────────────────────────────────────────
const C = {
  primary:     '#267340',
  primaryDark: '#1c5c30',
  dark:        '#1c4028',
  tomato:      '#e6352a',
  tomatoDark:  '#b82d23',
  amber:       '#d97706',
  bg:          '#f4f7f2',
  muted:       '#e4ebe2',
  white:       '#ffffff',
  textDark:    '#1c4028',
  textMid:     '#4a6357',
  textLight:   '#7a9488',
  border:      '#d0dccb',
};

// ── Helpers prix & labels ─────────────────────────────────────────────────────
function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' FCFA';
}

const PAIEMENT_LABELS: Record<string, string> = {
  mobile_money: 'Mobile Money',
  carte:        'Carte bancaire',
  especes:      'Espèces',
};

const COMMANDE_LABELS: Record<string, string> = {
  livraison: 'Livraison à domicile',
  sur_place: 'Sur place',
  emporter:  'À emporter',
};

// Même logique que le site (src/lib/orderStatus.ts) : ambre quand une action est attendue, puis un vert qui se
// renforce jusqu'à « prête », gris discret une fois terminé, rouge pour une annulation.
const STATUT_META: Record<string, { label: string; bg: string; color: string }> = {
  en_attente:     { label: 'En attente',    bg: '#fef3c7', color: '#b45309' },
  confirmee:      { label: 'Confirmée',     bg: '#eef5f0', color: '#267340' },
  en_preparation: { label: 'En préparation', bg: '#d5e6da', color: '#267340' },
  prete:          { label: 'Prête',         bg: '#bcd8c5', color: '#1d5a32' },
  livree:         { label: 'Livrée',        bg: '#f1f5f9', color: '#5b6f66' },
  annulee:        { label: 'Annulée',       bg: '#fee2e2', color: '#c42a20' },
  remboursee:     { label: 'Remboursée',    bg: '#f1f5f9', color: '#5b6f66' },
};

// ── Blocs réutilisables ───────────────────────────────────────────────────────

function preheaderHtml(text: string): string {
  const filler = ' ‌'.repeat(80);
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};">${text}${filler}</div>`;
}

function header(tagline: string): string {
  return `
<tr>
  <td>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="height:4px;background:${C.primary};font-size:0;line-height:0;">&nbsp;</td>
      </tr>
      <tr>
        <td class="email-header" style="background:${C.dark};padding:36px 48px 28px;text-align:center;">
          <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:26px;
                    font-weight:400;color:${C.white};letter-spacing:5px;text-transform:uppercase;">
            La D&eacute;licieuse Di&egrave;te
          </p>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:9px;
                    letter-spacing:3px;text-transform:uppercase;color:${C.primary};">
            ${tagline}
          </p>
        </td>
      </tr>
      <tr>
        <td style="height:2px;background:${C.primary};font-size:0;line-height:0;">&nbsp;</td>
      </tr>
    </table>
  </td>
</tr>`;
}

function footer(): string {
  const year = new Date().getFullYear();
  const email = process.env.EMAIL_USER || 'contact@ladelicieuse.ga';
  return `
<tr>
  <td>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="height:1px;background:${C.border};font-size:0;line-height:0;">&nbsp;</td>
      </tr>
      <tr>
        <td class="email-footer" style="background:${C.bg};padding:28px 48px 24px;text-align:center;">
          <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:13px;
                    font-weight:400;color:${C.primary};letter-spacing:3px;text-transform:uppercase;">
            La D&eacute;licieuse Di&egrave;te
          </p>
          <p style="margin:0 0 2px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${C.textLight};">
            Cuisine saine &amp; savoureuse &middot; Libreville, Gabon
          </p>
          <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${C.textLight};">
            <a href="mailto:${email}" style="color:${C.textLight};text-decoration:none;">${email}</a>
          </p>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:${C.border};">
            &copy; ${year} La D&eacute;licieuse Di&egrave;te &middot; Tous droits r&eacute;serv&eacute;s
          </p>
        </td>
      </tr>
      <tr>
        <td style="height:4px;background:${C.primary};font-size:0;line-height:0;">&nbsp;</td>
      </tr>
    </table>
  </td>
</tr>`;
}

function btn(href: string, label: string, bg = C.primary): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" class="btn-block" style="padding:28px 0 20px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                   xmlns:w="urn:schemas-microsoft-com:office:word"
                   href="${href}" style="height:48px;v-text-anchor:middle;width:240px;"
                   arcsize="8%" stroke="f" fillcolor="${bg}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:11px;
                       font-weight:700;letter-spacing:2px;text-transform:uppercase;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${href}"
         style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;
                padding:15px 44px;font-family:Arial,Helvetica,sans-serif;font-size:11px;
                font-weight:700;letter-spacing:2px;text-transform:uppercase;
                border-radius:4px;-webkit-text-size-adjust:none;mso-hide:all;">
        ${label}
      </a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

function divider(): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="height:1px;background:${C.muted};font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
</table>`;
}

function alertBox(html: string, borderColor = C.primary): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="background:${C.bg};border-left:3px solid ${borderColor};
               padding:14px 18px;border-radius:0 4px 4px 0;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;
                color:${C.textMid};line-height:1.7;">${html}</p>
    </td>
  </tr>
</table>`;
}

function wrapper(rows: string, preheaderText = ''): string {
  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>La D&eacute;licieuse Di&egrave;te</title>
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
  <style>
    body,table,td { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }
    img   { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a     { color:${C.primary}; }
    body  { margin:0; padding:0; background-color:${C.muted}; }
    @media only screen and (max-width:640px) {
      .email-wrapper  { padding:12px 8px !important; }
      .email-header   { padding:28px 24px 22px !important; }
      .email-body     { padding:28px 24px !important; }
      .email-footer   { padding:20px 24px 16px !important; }
      .btn-block      { padding:20px 0 12px !important; }
      .col-third      { display:block !important; width:100% !important;
                        text-align:center !important; padding:10px 0 !important;
                        border:none !important; }
      .order-item-row td { display:block !important; width:100% !important;
                           text-align:left !important; padding:2px 0 !important; }
      .order-item-price  { text-align:right !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${C.muted};">
  ${preheaderText ? preheaderHtml(preheaderText) : ''}
  <table width="100%" cellpadding="0" cellspacing="0" border="0" class="email-wrapper"
         style="background-color:${C.muted};padding:32px 16px;">
    <tr>
      <td align="center">
        <!--[if mso]><table width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
        <table cellpadding="0" cellspacing="0" border="0"
               style="background:${C.white};width:100%;max-width:600px;
                      border:1px solid ${C.border};">
          ${rows}
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── 0. Email groupé (broadcast admin) ─────────────────────────────────────────

export async function sendBroadcastEmail(
  to: string,
  nom: string,
  subject: string,
  message: string,
): Promise<void> {
  const frontendUrl = primaryFrontendUrl() ?? 'http://localhost:5100';
  const bodyHtml = escapeHtml(message).split(/\n{2,}/).map(
    para => `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;
                  line-height:1.9;color:${C.textMid};">${para.replace(/\n/g, '<br>')}</p>`
  ).join('');

  const rows = `
    ${header('Communication')}
    <tr>
      <td class="email-body" style="padding:44px 48px;">
        <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                  letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
          Bonjour ${escapeHtml(nom)}
        </p>
        <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;
                  font-weight:400;color:${C.textDark};">
          ${escapeHtml(subject)}
        </p>
        ${bodyHtml}

        ${btn(frontendUrl, 'Visiter le site')}
      </td>
    </tr>
    ${footer()}`;

  await getTransporter().sendMail({
    from:    `"La Délicieuse Diète" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html:    wrapper(rows, subject),
    text:    `${subject}\n\nBonjour ${nom},\n\n${message}\n\n${frontendUrl}\n\n© ${new Date().getFullYear()} La Délicieuse Diète · Libreville, Gabon`,
  });
}

// ── 1. Email de vérification de compte ───────────────────────────────────────

export async function sendVerificationEmail(to: string, nom: string, token: string): Promise<void> {
  const frontendUrl = primaryFrontendUrl() ?? 'http://localhost:5100';
  const verifyUrl   = `${frontendUrl}/verify-email?token=${token}`;

  const rows = `
    ${header('Activation de compte')}
    <tr>
      <td class="email-body" style="padding:44px 48px;">
        <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                  letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
          Bonjour
        </p>
        <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:24px;
                  font-weight:400;color:${C.textDark};">
          ${nom}
        </p>
        <p style="margin:0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;
                  line-height:1.9;color:${C.textMid};">
          Merci de rejoindre <strong style="color:${C.textDark};">La D&eacute;licieuse Di&egrave;te</strong>.
          Pour activer votre compte et commencer &agrave; commander, veuillez confirmer votre adresse email en cliquant sur le bouton ci-dessous.
        </p>

        ${btn(verifyUrl, 'Confirmer mon adresse email')}

        ${divider()}

        <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;
                  color:${C.textLight};line-height:1.7;">
          Ce lien est valable pendant <strong style="color:${C.textMid};">24 heures</strong>.
        </p>

        ${divider()}

        ${alertBox('Si vous n&apos;&ecirc;tes pas &agrave; l&apos;origine de cette inscription, ignorez simplement cet email. Aucune action n&apos;est requise.', C.border)}
      </td>
    </tr>
    ${footer()}`;

  await getTransporter().sendMail({
    from:    `"La Délicieuse Diète" <${process.env.EMAIL_USER}>`,
    to,
    subject: `${nom}, confirmez votre adresse email — La Délicieuse Diète`,
    html:    wrapper(rows, `Confirmez votre email pour activer votre compte La Délicieuse Diète.`),
    text:    `Bonjour ${nom},\n\nConfirmez votre adresse email pour activer votre compte La Délicieuse Diète.\n\nLien (valable 24h) : ${verifyUrl}\n\n© ${new Date().getFullYear()} La Délicieuse Diète · Libreville, Gabon`,
  });
}

// ── 2. Email de bienvenue (après vérification) ────────────────────────────────

export async function sendWelcomeEmail(to: string, nom: string): Promise<void> {
  const frontendUrl = primaryFrontendUrl() ?? 'http://localhost:5100';

  const rows = `
    ${header('Bienvenue')}
    <tr>
      <td class="email-body" style="padding:44px 48px;">
        <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                  letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
          Compte activ&eacute;
        </p>
        <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:24px;
                  font-weight:400;color:${C.textDark};">
          Bienvenue, ${nom}&nbsp;!
        </p>
        <p style="margin:0 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;
                  line-height:1.9;color:${C.textMid};">
          Votre compte est d&eacute;sormais actif. D&eacute;couvrez nos salades compos&eacute;es,
          jus d&eacute;tox et repas &eacute;quilibr&eacute;s pr&eacute;par&eacute;s chaque jour avec soin,
          livr&eacute;s directement chez vous &agrave; Libreville.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background:${C.bg};border:1px solid ${C.muted};
                       border-radius:4px;padding:20px 24px;">
              <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:9px;
                        letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
                Votre statut fid&eacute;lit&eacute;
              </p>
              <p style="margin:0 0 2px;font-family:Georgia,'Times New Roman',serif;font-size:18px;
                        color:${C.primary};">
                Membre Bronze
              </p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${C.textLight};">
                Gagnez des points &agrave; chaque commande &mdash; niveaux Argent, Or et Platine vous attendent.
              </p>
            </td>
          </tr>
        </table>

        ${btn(frontendUrl + '/composer', 'Passer ma première commande')}

        ${divider()}

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td class="col-third" width="33%" style="text-align:center;padding:0 8px;vertical-align:top;">
              <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:20px;color:${C.primary};">&#9672;</p>
              <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:${C.textDark};">Salades</p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${C.textLight};">Compos&eacute;es &agrave; votre go&ucirc;t</p>
            </td>
            <td class="col-third" width="34%" style="text-align:center;padding:0 8px;vertical-align:top;
                border-left:1px solid ${C.muted};border-right:1px solid ${C.muted};">
              <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:20px;color:${C.primary};">&#9678;</p>
              <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:${C.textDark};">Jus &amp; D&eacute;tox</p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${C.textLight};">Pressage &agrave; froid</p>
            </td>
            <td class="col-third" width="33%" style="text-align:center;padding:0 8px;vertical-align:top;">
              <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:20px;color:${C.primary};">&#9673;</p>
              <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:${C.textDark};">Repas chauds</p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${C.textLight};">Plats &eacute;quilibr&eacute;s du jour</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${footer()}`;

  await getTransporter().sendMail({
    from:    `"La Délicieuse Diète" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Bienvenue chez La Délicieuse Diète, ${nom}`,
    html:    wrapper(rows, `Votre compte est activé. Découvrez nos salades, jus et repas équilibrés.`),
    text:    `Bienvenue ${nom} !\n\nVotre compte La Délicieuse Diète est activé.\n\nCommencez à commander : ${frontendUrl}/composer\n\nNos produits : Salades composées, Jus détox, Repas chauds du jour\n\n© ${new Date().getFullYear()} La Délicieuse Diète · Libreville, Gabon`,
  });
}

// ── 3. OTP connexion admin ────────────────────────────────────────────────────

export async function sendLoginOTPEmail(to: string, otp: string): Promise<void> {
  const date = new Date().toLocaleString('fr-FR', {
    timeZone: 'Africa/Libreville',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const digits = otp.split('').map(d => `
    <td style="padding:0 5px;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="width:44px;height:56px;background:${C.bg};border:1px solid ${C.muted};
                     border-radius:4px;text-align:center;vertical-align:middle;">
            <span style="font-family:Georgia,'Times New Roman',serif;font-size:28px;
                         font-weight:700;color:${C.primary};line-height:56px;">${d}</span>
          </td>
        </tr>
      </table>
    </td>`).join('');

  const rows = `
    ${header('Acc&egrave;s administrateur')}
    <tr>
      <td class="email-body" style="padding:44px 48px;">
        <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                  letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
          V&eacute;rification en deux &eacute;tapes
        </p>
        <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;
                  font-weight:400;color:${C.textDark};">
          Code de connexion
        </p>
        <p style="margin:0 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;
                  line-height:1.9;color:${C.textMid};">
          Une connexion au back-office a &eacute;t&eacute; demand&eacute;e.
          Utilisez le code ci-dessous pour finaliser l&apos;authentification.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background:${C.dark};border-radius:4px;padding:28px 24px;text-align:center;">
              <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:9px;
                        letter-spacing:3px;text-transform:uppercase;color:${C.textLight};">
                Code &agrave; usage unique
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>${digits}</tr>
              </table>
              <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;
                        color:${C.textLight};">
                Valable <strong style="color:${C.tomato};">5 minutes</strong> &mdash; ne partagez jamais ce code.
              </p>
            </td>
          </tr>
        </table>

        ${divider()}

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                       letter-spacing:1px;text-transform:uppercase;color:${C.textLight};
                       width:70px;vertical-align:top;border-bottom:1px solid ${C.muted};">Date</td>
            <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                       color:${C.textMid};border-bottom:1px solid ${C.muted};">${date}</td>
          </tr>
        </table>

        ${divider()}

        ${alertBox('Si vous n&apos;&ecirc;tes pas &agrave; l&apos;origine de cette tentative de connexion, ignorez cet email et s&eacute;curisez imm&eacute;diatement votre compte.', C.tomato)}
      </td>
    </tr>
    ${footer()}`;

  await getTransporter().sendMail({
    from:    `"La Délicieuse Diète · Admin" <${process.env.EMAIL_USER}>`,
    to,
    subject: `[${otp}] Code de connexion administrateur`,
    html:    wrapper(rows, `Votre code OTP administrateur : ${otp} — Valable 5 minutes.`),
    text:    `Code de connexion administrateur : ${otp}\n\nValable 5 minutes.\nDate : ${date}\n\nSi vous n'êtes pas à l'origine de cette connexion, sécurisez votre compte.`,
  });
}

// ── 4. Réinitialisation de mot de passe ──────────────────────────────────────

// En production, un lien vers localhost serait envoyé au client sans que personne ne s'en aperçoive : on préfère échouer bruyamment.
function siteUrl(): string {
  const url = primaryFrontendUrl();
  if (url) return url;
  if (process.env.NODE_ENV === 'production') throw new Error('FRONTEND_URL non défini en production : lien de réinitialisation impossible');
  return 'http://localhost:5100';
}

export async function sendPasswordResetEmail(to: string, nom: string, token: string): Promise<void> {
  const resetUrl = `${siteUrl()}/reset-password?token=${token}`;

  const rows = `
    ${header('S&eacute;curit&eacute; du compte')}
    <tr>
      <td class="email-body" style="padding:44px 48px;">
        <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                  letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
          Bonjour
        </p>
        <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:24px;
                  font-weight:400;color:${C.textDark};">
          ${nom}
        </p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;
                  line-height:1.9;color:${C.textMid};">
          Nous avons re&ccedil;u une demande de r&eacute;initialisation du mot de passe de votre compte.
          Cliquez sur le bouton ci-dessous pour en d&eacute;finir un nouveau.
        </p>

        ${btn(resetUrl, 'Réinitialiser mon mot de passe')}

        ${divider()}

        <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;
                  color:${C.textLight};line-height:1.7;">
          Ce lien est valable pendant <strong style="color:${C.textMid};">1 heure</strong>.
        </p>

        ${divider()}

        ${alertBox('Si vous n&apos;&ecirc;tes pas &agrave; l&apos;origine de cette demande, ignorez cet email. Votre mot de passe actuel reste inchang&eacute;.', C.border)}
      </td>
    </tr>
    ${footer()}`;

  await getTransporter().sendMail({
    from:    `"La Délicieuse Diète" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Réinitialisation de votre mot de passe — La Délicieuse Diète`,
    html:    wrapper(rows, `Lien de réinitialisation de votre mot de passe La Délicieuse Diète. Valable 1 heure.`),
    text:    `Bonjour ${nom},\n\nVous avez demandé la réinitialisation de votre mot de passe.\n\nLien (valable 1h) : ${resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\n© ${new Date().getFullYear()} La Délicieuse Diète · Libreville, Gabon`,
  });
}

export async function sendAdminPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const rows = `
    ${header('Acc&egrave;s administrateur')}
    <tr>
      <td class="email-body" style="padding:44px 48px;">
        <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;
                  font-weight:400;color:${C.textDark};">
          Mot de passe administrateur oubli&eacute;
        </p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;
                  line-height:1.9;color:${C.textMid};">
          Une r&eacute;initialisation du mot de passe du back-office a &eacute;t&eacute; demand&eacute;e.
          Cliquez sur le bouton ci-dessous pour en d&eacute;finir un nouveau.
        </p>

        ${btn(resetUrl, 'Définir un nouveau mot de passe')}

        ${divider()}

        <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;
                  color:${C.textLight};line-height:1.7;">
          Ce lien est valable <strong style="color:${C.textMid};">30 minutes</strong> et ne peut &ecirc;tre utilis&eacute; qu&apos;une fois.
        </p>

        ${divider()}

        ${alertBox('Si vous n&apos;&ecirc;tes pas &agrave; l&apos;origine de cette demande, ignorez cet email. Votre mot de passe actuel reste inchang&eacute;.', C.tomato)}
      </td>
    </tr>
    ${footer()}`;

  await getTransporter().sendMail({
    from:    `"La Délicieuse Diète · Admin" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Réinitialisation du mot de passe administrateur',
    html:    wrapper(rows, 'Lien de réinitialisation du mot de passe administrateur. Valable 30 minutes.'),
    text:    `Une réinitialisation du mot de passe administrateur a été demandée.\n\nLien (valable 30 minutes, usage unique) : ${resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
  });
}

// ── Changement de l'adresse de connexion administrateur ───────────────────────

// Envoyé à la NOUVELLE adresse : seul celui qui peut la lire peut confirmer le changement.
export async function sendAdminEmailChangeCode(to: string, code: string): Promise<void> {
  const rows = `
    ${header('Acc&egrave;s administrateur')}
    <tr>
      <td class="email-body" style="padding:44px 48px;">
        <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;
                  font-weight:400;color:${C.textDark};">
          Confirmer cette adresse e-mail
        </p>
        <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;
                  line-height:1.9;color:${C.textMid};">
          Cette adresse a &eacute;t&eacute; propos&eacute;e comme adresse de connexion du back-office.
          Saisissez le code ci-dessous dans les param&egrave;tres pour confirmer le changement.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background:${C.dark};border-radius:4px;padding:24px;text-align:center;">
              <span style="font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:700;
                           letter-spacing:10px;color:#ffffff;">${escapeHtml(code)}</span>
              <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${C.textLight};">
                Valable <strong style="color:${C.tomato};">10 minutes</strong> &mdash; ne partagez jamais ce code.
              </p>
            </td>
          </tr>
        </table>

        ${divider()}

        ${alertBox('Si vous n&apos;&ecirc;tes pas &agrave; l&apos;origine de cette demande, ignorez cet email : rien ne sera modifi&eacute;.', C.tomato)}
      </td>
    </tr>
    ${footer()}`;

  await getTransporter().sendMail({
    from:    `"La Délicieuse Diète · Admin" <${process.env.EMAIL_USER}>`,
    to,
    subject: `[${code}] Confirmer votre adresse administrateur`,
    html:    wrapper(rows, `Code de confirmation : ${code} — valable 10 minutes.`),
    text:    `Code pour confirmer cette adresse comme adresse de connexion administrateur : ${code}

Valable 10 minutes.
Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
  });
}

// Envoyé à l'ANCIENNE adresse une fois le changement fait : si ce n'est pas l'administrateur, il le saura tout de suite.
export async function sendAdminEmailChangedNotice(to: string, newEmail: string): Promise<void> {
  const rows = `
    ${header('Acc&egrave;s administrateur')}
    <tr>
      <td class="email-body" style="padding:44px 48px;">
        <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;
                  font-weight:400;color:${C.textDark};">
          Adresse de connexion modifi&eacute;e
        </p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;
                  line-height:1.9;color:${C.textMid};">
          L&apos;adresse de connexion du back-office est d&eacute;sormais
          <strong style="color:${C.textDark};">${escapeHtml(newEmail)}</strong>.
          Les codes de connexion ne seront plus envoy&eacute;s &agrave; cette adresse-ci.
        </p>

        ${divider()}

        ${alertBox('Si vous n&apos;&ecirc;tes pas &agrave; l&apos;origine de ce changement, contactez imm&eacute;diatement le support : quelqu&apos;un a acc&egrave;s &agrave; votre back-office.', C.tomato)}
      </td>
    </tr>
    ${footer()}`;

  await getTransporter().sendMail({
    from:    `"La Délicieuse Diète · Admin" <${process.env.EMAIL_USER}>`,
    to,
    subject: "L'adresse de connexion administrateur a changé",
    html:    wrapper(rows, "L'adresse de connexion du back-office a été modifiée."),
    text:    `L'adresse de connexion du back-office est désormais ${newEmail}.
Les codes de connexion ne seront plus envoyés à cette adresse.

Si vous n'êtes pas à l'origine de ce changement, contactez immédiatement le support.`,
  });
}

// ── 5. Envoi de facture client ────────────────────────────────────────────────

export interface InvoiceEmailData {
  numero:       string;
  client:       string;
  items:        { nom: string; qty: number; prixUnit: number }[];
  totalHT:      number;
  tva:          number;
  totalTTC:     number;
  modePaiement: string;
  statut:       'payee' | 'en_attente' | 'annulee' | 'remboursee';
  createdAt:    string;
  notes?:       string;
}

const INVOICE_STATUT: Record<string, { label: string; bg: string; color: string }> = {
  payee:      { label: 'Payée',      bg: '#d1fae5', color: '#065f46' },
  en_attente: { label: 'En attente', bg: '#fef3c7', color: '#92400e' },
  annulee:    { label: 'Annulée',    bg: '#fee2e2', color: '#991b1b' },
  remboursee: { label: 'Remboursée', bg: '#ede9fe', color: '#5b21b6' },
};

export async function sendInvoiceEmail(to: string, invoice: InvoiceEmailData): Promise<void> {
  const statut  = INVOICE_STATUT[invoice.statut] ?? INVOICE_STATUT['en_attente'];
  const dateStr = new Date(invoice.createdAt).toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const itemRows = invoice.items.map(it => `
    <tr style="border-bottom:1px solid ${C.muted};">
      <td style="padding:10px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                 color:${C.textDark};line-height:1.4;">${it.nom}</td>
      <td style="padding:10px 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                 color:${C.textMid};text-align:center;white-space:nowrap;">x&nbsp;${it.qty}</td>
      <td style="padding:10px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                 color:${C.textMid};text-align:right;white-space:nowrap;">
        ${fmt(it.prixUnit)}
      </td>
      <td style="padding:10px 0 10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                 font-weight:700;color:${C.textDark};text-align:right;white-space:nowrap;">
        ${fmt(it.prixUnit * it.qty)}
      </td>
    </tr>`).join('');

  const rows = `
    ${header('Votre facture')}
    <tr>
      <td class="email-body" style="padding:44px 48px;">

        <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                  letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
          Bonjour
        </p>
        <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:24px;
                  font-weight:400;color:${C.textDark};">
          ${invoice.client}
        </p>
        <p style="margin:0 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;
                  line-height:1.9;color:${C.textMid};">
          Veuillez trouver ci-dessous le détail de votre facture
          <strong style="color:${C.textDark};">${invoice.numero}</strong>.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background:${C.dark};border-radius:4px;padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 2px;font-family:Arial,Helvetica,sans-serif;font-size:9px;
                              letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
                      Facture
                    </p>
                    <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:20px;
                              font-weight:400;color:${C.white};">
                      ${invoice.numero}
                    </p>
                  </td>
                  <td style="text-align:right;vertical-align:top;">
                    <span style="display:inline-block;background:${statut.bg};
                                 color:${statut.color};padding:4px 12px;border-radius:20px;
                                 font-family:Arial,Helvetica,sans-serif;font-size:10px;
                                 font-weight:700;letter-spacing:1px;text-transform:uppercase;">
                      ${statut.label}
                    </span>
                  </td>
                </tr>
              </table>
              <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;
                        color:${C.textLight};">${dateStr}</p>
            </td>
          </tr>
        </table>

        ${divider()}

        <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                  letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
          Détail de la facture
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border-top:2px solid ${C.dark};">
          <thead>
            <tr style="background:${C.bg};">
              <th style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                         letter-spacing:1px;text-transform:uppercase;color:${C.textLight};
                         text-align:left;font-weight:400;">Article</th>
              <th style="padding:8px;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                         letter-spacing:1px;text-transform:uppercase;color:${C.textLight};
                         text-align:center;font-weight:400;">Qté</th>
              <th style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                         letter-spacing:1px;text-transform:uppercase;color:${C.textLight};
                         text-align:right;font-weight:400;">P.U.</th>
              <th style="padding:8px 0 8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                         letter-spacing:1px;text-transform:uppercase;color:${C.textLight};
                         text-align:right;font-weight:400;">Total HT</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="margin-top:16px;border-top:1px solid ${C.muted};">
          <tr>
            <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                       color:${C.textMid};">Sous-total HT</td>
            <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                       color:${C.textMid};text-align:right;">${fmt(invoice.totalHT)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                       color:${C.textMid};">TVA (18 %)</td>
            <td style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                       color:${C.textMid};text-align:right;">${fmt(invoice.tva)}</td>
          </tr>
          <tr style="border-top:2px solid ${C.dark};">
            <td style="padding:12px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;
                       color:${C.textDark};">Total TTC</td>
            <td style="padding:12px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;
                       font-weight:700;color:${C.primary};text-align:right;">${fmt(invoice.totalTTC)}</td>
          </tr>
        </table>

        ${divider()}

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="50%" style="padding:0 12px 0 0;vertical-align:top;">
              <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:9px;
                        letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
                Mode de paiement
              </p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                        color:${C.textMid};">
                ${invoice.modePaiement}
              </p>
            </td>
            <td width="50%" style="padding:0 0 0 12px;vertical-align:top;border-left:1px solid ${C.muted};">
              <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:9px;
                        letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
                Statut
              </p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                        color:${C.textMid};">
                ${statut.label}
              </p>
            </td>
          </tr>
        </table>

        ${invoice.notes ? `
        ${divider()}
        <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:9px;
                  letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">Notes</p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                  color:${C.textMid};font-style:italic;line-height:1.7;">${invoice.notes}</p>
        ` : ''}

        ${divider()}

        ${alertBox('Des questions sur cette facture&nbsp;? Répondez à cet email ou contactez-nous directement. Nous traitons votre demande dans les meilleurs délais.', C.border)}
      </td>
    </tr>
    ${footer()}`;

  const itemsText = invoice.items.map(it => `  - ${it.nom} x${it.qty}  ${fmt(it.prixUnit * it.qty)}`).join('\n');

  await getTransporter().sendMail({
    from:    `"La Délicieuse Diète" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Facture ${invoice.numero} — La Délicieuse Diète`,
    html:    wrapper(rows, `Facture ${invoice.numero} · Total TTC : ${fmt(invoice.totalTTC)}.`),
    text:    `Bonjour ${invoice.client},\n\nVeuillez trouver ci-dessous le détail de votre facture ${invoice.numero}.\n\nArticles :\n${itemsText}\n\nSous-total HT : ${fmt(invoice.totalHT)}\nTVA (18%) : ${fmt(invoice.tva)}\nTotal TTC : ${fmt(invoice.totalTTC)}\n\nMode de paiement : ${invoice.modePaiement}\nStatut : ${statut.label}\n\n© ${new Date().getFullYear()} La Délicieuse Diète · Libreville, Gabon`,
  });
}

// ── 6. Confirmation de commande ───────────────────────────────────────────────

export interface OrderEmailData {
  numero:        string;
  nom:           string;
  items:         { nom: string; qty: number; prix: number }[];
  sousTotal:     number;
  fraisLivraison:number;
  total:         number;
  modePaiement:  string;
  modeCommande:  string;
  statut:        string;
  notes?:        string;
  adresse?:      string;
}

export async function sendOrderConfirmationEmail(to: string, order: OrderEmailData): Promise<void> {
  const frontendUrl = primaryFrontendUrl() ?? 'http://localhost:5100';
  const statusMeta  = STATUT_META[order.statut] ?? STATUT_META['en_attente'];
  const dateStr     = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const itemRows = order.items.map(item => `
    <tr class="order-item-row" style="border-bottom:1px solid ${C.muted};">
      <td style="padding:10px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                 color:${C.textDark};line-height:1.4;">${item.nom}</td>
      <td style="padding:10px 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                 color:${C.textMid};text-align:center;white-space:nowrap;">x&nbsp;${item.qty}</td>
      <td class="order-item-price" style="padding:10px 0;font-family:Arial,Helvetica,sans-serif;
                 font-size:13px;color:${C.textMid};text-align:right;white-space:nowrap;">
        ${fmt(item.prix)}
      </td>
      <td class="order-item-price" style="padding:10px 0 10px 12px;font-family:Arial,Helvetica,sans-serif;
                 font-size:13px;font-weight:700;color:${C.textDark};text-align:right;white-space:nowrap;">
        ${fmt(item.prix * item.qty)}
      </td>
    </tr>`).join('');

  const rows = `
    ${header('Confirmation de commande')}
    <tr>
      <td class="email-body" style="padding:44px 48px;">

        <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                  letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
          Merci pour votre commande
        </p>
        <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:24px;
                  font-weight:400;color:${C.textDark};">
          ${order.nom}
        </p>
        <p style="margin:0 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;
                  line-height:1.9;color:${C.textMid};">
          Votre commande a &eacute;t&eacute; bien re&ccedil;ue et est en cours de traitement.
          Vous serez inform&eacute; d&egrave;s qu&apos;elle sera confirm&eacute;e.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background:${C.dark};border-radius:4px;padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 2px;font-family:Arial,Helvetica,sans-serif;font-size:9px;
                              letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
                      Num&eacute;ro de commande
                    </p>
                    <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:20px;
                              font-weight:400;color:${C.white};">
                      ${order.numero}
                    </p>
                  </td>
                  <td style="text-align:right;vertical-align:top;">
                    <span style="display:inline-block;background:${statusMeta.bg};
                                 color:${statusMeta.color};padding:4px 12px;border-radius:20px;
                                 font-family:Arial,Helvetica,sans-serif;font-size:10px;
                                 font-weight:700;letter-spacing:1px;text-transform:uppercase;">
                      ${statusMeta.label}
                    </span>
                  </td>
                </tr>
              </table>
              <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;
                        color:${C.textLight};">${dateStr}</p>
            </td>
          </tr>
        </table>

        ${divider()}

        <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                  letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
          D&eacute;tail de la commande
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border-top:2px solid ${C.dark};">
          <thead>
            <tr style="background:${C.bg};">
              <th style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                         letter-spacing:1px;text-transform:uppercase;color:${C.textLight};
                         text-align:left;font-weight:400;">Article</th>
              <th style="padding:8px;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                         letter-spacing:1px;text-transform:uppercase;color:${C.textLight};
                         text-align:center;font-weight:400;">Qté</th>
              <th style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                         letter-spacing:1px;text-transform:uppercase;color:${C.textLight};
                         text-align:right;font-weight:400;">P.U.</th>
              <th style="padding:8px 0 8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:10px;
                         letter-spacing:1px;text-transform:uppercase;color:${C.textLight};
                         text-align:right;font-weight:400;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="margin-top:16px;border-top:1px solid ${C.muted};">
          <tr>
            <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                       color:${C.textMid};">Sous-total</td>
            <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                       color:${C.textMid};text-align:right;">${fmt(order.sousTotal)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                       color:${C.textMid};">Frais de livraison</td>
            <td style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                       color:${C.textMid};text-align:right;">
              ${order.fraisLivraison > 0 ? fmt(order.fraisLivraison) : 'Offert'}
            </td>
          </tr>
          <tr style="border-top:2px solid ${C.dark};">
            <td style="padding:12px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;
                       color:${C.textDark};">Total</td>
            <td style="padding:12px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;
                       font-weight:700;color:${C.primary};text-align:right;">${fmt(order.total)}</td>
          </tr>
        </table>

        ${divider()}

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="50%" style="padding:0 12px 0 0;vertical-align:top;">
              <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:9px;
                        letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
                Mode de livraison
              </p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                        color:${C.textMid};">
                ${COMMANDE_LABELS[order.modeCommande] || order.modeCommande}
              </p>
              ${order.adresse ? `<p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${C.textLight};">${order.adresse}</p>` : ''}
            </td>
            <td width="50%" style="padding:0 0 0 12px;vertical-align:top;border-left:1px solid ${C.muted};">
              <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:9px;
                        letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
                Paiement
              </p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                        color:${C.textMid};">
                ${PAIEMENT_LABELS[order.modePaiement] || order.modePaiement}
              </p>
            </td>
          </tr>
        </table>

        ${order.notes ? `
        ${divider()}
        <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:9px;
                  letter-spacing:2px;text-transform:uppercase;color:${C.textLight};">
          Notes
        </p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                  color:${C.textMid};font-style:italic;line-height:1.7;">${order.notes}</p>
        ` : ''}

        ${btn(frontendUrl + '/mon-compte', 'Suivre ma commande')}

        ${divider()}

        ${alertBox('Des questions sur votre commande&nbsp;? Contactez-nous en r&eacute;pondant &agrave; cet email ou via notre back-office client. Nous traitons votre demande dans les meilleurs d&eacute;lais.', C.border)}
      </td>
    </tr>
    ${footer()}`;

  const itemsText = order.items.map(i => `  - ${i.nom} x${i.qty}  ${fmt(i.prix * i.qty)}`).join('\n');

  await getTransporter().sendMail({
    from:    `"La Délicieuse Diète" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Commande ${order.numero} reçue — La Délicieuse Diète`,
    html:    wrapper(rows, `Commande ${order.numero} bien reçue. Total : ${fmt(order.total)}. Nous préparons votre commande !`),
    text:    `Merci ${order.nom} !\n\nCommande n° ${order.numero} reçue.\n\nArticles :\n${itemsText}\n\nSous-total : ${fmt(order.sousTotal)}\nFrais de livraison : ${order.fraisLivraison > 0 ? fmt(order.fraisLivraison) : 'Offert'}\nTotal : ${fmt(order.total)}\n\nLivraison : ${COMMANDE_LABELS[order.modeCommande] || order.modeCommande}\nPaiement : ${PAIEMENT_LABELS[order.modePaiement] || order.modePaiement}\n\nSuivez votre commande : ${frontendUrl}/mon-compte\n\n© ${new Date().getFullYear()} La Délicieuse Diète · Libreville, Gabon`,
  });
}

// ── Alerte équipe : nouvelle commande (secours quand aucun appareil n'a pu recevoir le push) ──────────────────────

export interface StaffOrderEmailData {
  numero:       string;
  clientNom:    string;
  telephone:    string;
  total:        number;
  modeCommande: string;
  adresse?:     string;
  items:        { nom: string; qty: number }[];
}

export async function sendNewOrderStaffEmail(to: string, order: StaffOrderEmailData): Promise<void> {
  const frontendUrl = primaryFrontendUrl() ?? 'http://localhost:5100';
  const pickup = order.modeCommande === 'sur_place';
  const modeLabel = pickup ? 'Retrait sur place' : 'Livraison';
  const lines = order.items.map(i => `${i.qty} × ${i.nom}`);
  const total = fmt(order.total);

  const rows = `
    ${header('Nouvelle commande')}
    <tr>
      <td class="email-body" style="padding:44px 48px;">
        <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:400;color:${C.textDark};">
          Commande ${escapeHtml(order.numero)}
        </p>
        <p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.9;color:${C.textMid};">
          <strong style="color:${C.textDark};">${escapeHtml(order.clientNom)}</strong> · ${escapeHtml(order.telephone)}<br>
          ${escapeHtml(modeLabel)}${order.adresse && !pickup ? ' · ' + escapeHtml(order.adresse) : ''}<br>
          Total : <strong style="color:${C.textDark};">${escapeHtml(total)}</strong>
        </p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.8;color:${C.textMid};">
          ${lines.map(escapeHtml).join('<br>')}
        </p>

        ${divider()}

        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${C.textMid};">
          <a href="${frontendUrl}/admin/commandes" style="color:${C.primary};">Ouvrir les commandes</a>
        </p>
      </td>
    </tr>
    ${footer()}`;

  await getTransporter().sendMail({
    from:    `"La Délicieuse Diète · Commandes" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Nouvelle commande ${order.numero} · ${total}`,
    html:    wrapper(rows, `${order.clientNom} · ${total} · ${modeLabel}`),
    text:    `Nouvelle commande ${order.numero}\n\n${order.clientNom} · ${order.telephone}\n${modeLabel}${order.adresse && !pickup ? ' · ' + order.adresse : ''}\nTotal : ${total}\n\n${lines.join('\n')}\n\nOuvrir les commandes : ${frontendUrl}/admin/commandes`,
  });
}
