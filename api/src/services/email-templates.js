const BRAND_COLOR = "#102a43";
const ACCENT_COLOR = "#0066cc";

function wrap({ title, preheader, children }) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f6f8;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

          <tr>
            <td style="background:${BRAND_COLOR};padding:24px 32px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">Carnavales</p>
            </td>
          </tr>

          <tr>
            <td style="padding:40px 32px 16px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;text-align:center;">${title}</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#555555;text-align:center;line-height:1.5;">${preheader}</p>
              ${children}
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #eef1f5;">
              <p style="margin:0;font-size:12px;color:#999999;text-align:center;line-height:1.5;">
                Si no solicitaste este mensaje, puedes ignorarlo de forma segura.<br/>
                &copy; ${new Date().getFullYear()} Carnavales. Todos los derechos reservados.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function otpEmail({ otp }) {
  return wrap({
    title: "Tu código de verificación",
    preheader: "Utiliza el siguiente código para completar tu inicio de sesión.",
    children: `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;">
        <tr>
          <td align="center" style="padding:20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
            <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:8px;color:${BRAND_COLOR};font-family:'Courier New',monospace;">${otp}</p>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 12px;font-size:14px;color:#666666;text-align:center;line-height:1.5;">
        Este código expira en <strong>5 minutos</strong>.
      </p>
    `,
  });
}

export function juradoAccesoEmail({ name, dni, url }) {
  return wrap({
    title: "Tu cuenta fue creada",
    preheader: "Ya podés ingresar al sistema de votación de Carnavales.",
    children: `
      <p style="margin:0 0 16px;font-size:14px;color:#666666;line-height:1.6;">
        ${name ? `Hola <strong>${name}</strong>,` : "Hola,"} tu cuenta de jurado en el
        sistema de votación de Carnavales fue creada correctamente. Ya tenés acceso.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 16px;">
        <tr>
          <td style="padding:14px 20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
            <p style="margin:0 0 8px;font-size:13px;color:#555555;">Para iniciar sesión vas a necesitar tu email y tu DNI:</p>
            <p style="margin:0;font-size:15px;font-weight:700;color:${BRAND_COLOR};font-family:'Courier New',monospace;">
              ${dni}
            </p>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 16px;">
        <tr>
          <td align="center">
            <a href="${url}"
               style="display:inline-block;padding:14px 32px;background:${ACCENT_COLOR};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
              Ir a la página de inicio
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:14px;color:#666666;text-align:center;line-height:1.5;">
        Vas a recibir un <strong>código (PIN)</strong> por correo al solicitar el
        ingreso con tu email y DNI. No respondas a este mensaje.
      </p>
    `,
  });
}

export function passwordResetEmail({ url }) {
  return wrap({
    title: "Restablece tu contraseña",
    preheader: "Recibimos una solicitud para cambiar tu contraseña.",
    children: `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;">
        <tr>
          <td align="center">
            <a href="${url}"
               style="display:inline-block;padding:14px 32px;background:${ACCENT_COLOR};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
              Restablecer contraseña
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 12px;font-size:14px;color:#666666;text-align:center;line-height:1.5;">
        O copia y pega este enlace en tu navegador:
      </p>
      <p style="margin:0 0 24px;font-size:13px;color:#999999;text-align:center;word-break:break-all;">
        <a href="${url}" style="color:${ACCENT_COLOR};text-decoration:underline;">${url}</a>
      </p>
      <p style="margin:0;font-size:14px;color:#666666;text-align:center;line-height:1.5;">
        Este enlace expira en <strong>30 minutos</strong>.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:24px 0 0;">
        <tr>
          <td style="padding:12px 16px;background:#fff8f0;border-radius:6px;border:1px solid #ffe0b2;">
            <p style="margin:0;font-size:13px;color:#b86e00;text-align:center;line-height:1.5;">
              Si no solicitaste este cambio, tu contraseña permanece segura. Puedes ignorar este mensaje.
            </p>
          </td>
        </tr>
      </table>
    `,
  });
}
