// Genera las tarjetas de estadísticas del perfil (SVG) con datos públicos de la API de GitHub.
// Sin servicios de terceros: lo ejecuta la Action de la serpiente y lo publica en la rama output.
//
//   GITHUB_TOKEN=... USUARIO=RaulNuGo06 node .github/scripts/tarjetas.mjs dist
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const usuario = process.env.USUARIO;
const salida = process.argv[2] ?? 'dist';
const token = process.env.GITHUB_TOKEN;
if (!usuario || !token) throw new Error('Faltan USUARIO o GITHUB_TOKEN');

const consulta = `query ($login: String!) {
  user(login: $login) {
    pullRequests { totalCount }
    contributionsCollection { totalCommitContributions contributionCalendar { totalContributions } }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
      totalCount
      nodes {
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: consulta, variables: { login: usuario } }),
});
const { data, errors } = await res.json();
if (errors) throw new Error(JSON.stringify(errors));
const u = data.user;

const repos = u.repositories.nodes;

const porLenguaje = new Map();
for (const repo of repos) {
  for (const { size, node } of repo.languages.edges) {
    const actual = porLenguaje.get(node.name) ?? { tamano: 0, color: node.color ?? '#7aa2f7' };
    actual.tamano += size;
    porLenguaje.set(node.name, actual);
  }
}
const total = [...porLenguaje.values()].reduce((s, l) => s + l.tamano, 0) || 1;
const lenguajes = [...porLenguaje.entries()]
  .sort((a, b) => b[1].tamano - a[1].tamano)
  .slice(0, 6)
  .map(([nombre, l]) => ({ nombre, color: l.color, pct: (l.tamano / total) * 100 }));

// Colores de Tokyo Night, los mismos que el resto del README
const C = { fondo: '#0d1117', borde: '#30363d', titulo: '#7aa2f7', texto: '#c0caf5', suave: '#9aa5ce', icono: '#bb9af7' };
const FUENTE = "font-family='Segoe UI, Ubuntu, Helvetica, Arial, sans-serif'";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function marco(ancho, alto, titulo, cuerpo, descripcion) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" role="img" aria-labelledby="t d">
<title id="t">${esc(titulo)}</title><desc id="d">${esc(descripcion)}</desc>
<rect x="0.5" y="0.5" width="${ancho - 1}" height="${alto - 1}" rx="6" fill="${C.fondo}" stroke="${C.borde}"/>
<text x="24" y="36" ${FUENTE} font-size="18" font-weight="600" fill="${C.titulo}">${esc(titulo)}</text>
${cuerpo}
</svg>
`;
}

const anio = new Date().getFullYear();
const filas = [
  ['Repositorios públicos', u.repositories.totalCount],
  [`Commits en ${anio}`, u.contributionsCollection.totalCommitContributions],
  ['Pull requests', u.pullRequests.totalCount],
  [`Contribuciones en ${anio}`, u.contributionsCollection.contributionCalendar.totalContributions],
];
const estadisticas = marco(
  420,
  170,
  `Estadísticas de ${usuario}`,
  filas
    .map(
      ([etiqueta, valor], i) =>
        `<circle cx="30" cy="${66 + i * 26}" r="4" fill="${C.icono}"/>` +
        `<text x="44" y="${71 + i * 26}" ${FUENTE} font-size="14" fill="${C.texto}">${esc(etiqueta)}</text>` +
        `<text x="396" y="${71 + i * 26}" ${FUENTE} font-size="14" font-weight="700" fill="${C.texto}" text-anchor="end">${valor}</text>`,
    )
    .join('\n'),
  filas.map(([e, v]) => `${e}: ${v}`).join(', '),
);

let x = 24;
const anchoBarra = 302;
const barra = lenguajes
  .map((l) => {
    const w = (l.pct / 100) * anchoBarra;
    const r = `<rect x="${x.toFixed(2)}" y="52" width="${w.toFixed(2)}" height="8" fill="${l.color}"/>`;
    x += w;
    return r;
  })
  .join('');
const lista = lenguajes
  .map((l, i) => {
    const cx = 24 + (i % 2) * 150;
    const cy = 86 + Math.floor(i / 2) * 26;
    return (
      `<circle cx="${cx + 5}" cy="${cy - 4}" r="5" fill="${l.color}"/>` +
      `<text x="${cx + 16}" y="${cy}" ${FUENTE} font-size="13" fill="${C.texto}">${esc(l.nombre)} <tspan fill="${C.suave}">${l.pct.toFixed(1).replace('.', ',')} %</tspan></text>`
    );
  })
  .join('\n');
const idiomas = marco(
  350,
  170,
  'Lenguajes más usados',
  `<clipPath id="b"><rect x="24" y="52" width="${anchoBarra}" height="8" rx="4"/></clipPath><g clip-path="url(#b)">${barra}</g>\n${lista}`,
  lenguajes.map((l) => `${l.nombre} ${l.pct.toFixed(1)} %`).join(', '),
);

mkdirSync(salida, { recursive: true });
writeFileSync(join(salida, 'estadisticas.svg'), estadisticas);
writeFileSync(join(salida, 'lenguajes.svg'), idiomas);
console.log('Tarjetas generadas:', filas.map(([e, v]) => `${e}=${v}`).join(', '), '|', lenguajes.map((l) => l.nombre).join(', '));
