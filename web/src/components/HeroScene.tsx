import { useState, type ReactNode } from 'react'
import { useReducedMotion } from '../motion/useReducedMotion'

// Cada camada é feita de dois blocos iguais lado a lado. Ela anda exatamente a largura de um bloco
// e recomeça, então o laço não tem salto. Nenhuma cor mora aqui: tudo vem de cena.css (tokens).
const TILE_WIDTH = 1200

const MOUNTAINS_HEIGHT = 64
const MOUNTAINS =
  'M0 64 L0 44 L90 20 L170 40 L260 12 L360 44 L450 26 L540 48 L640 16 L740 42 L830 24 L930 46 L1030 20 L1120 38 L1200 44 L1200 64 Z'

// [posição, largura, altura]; cada prédio termina 4 px antes do próximo e o último fecha em 1200.
const BUILDINGS_HEIGHT = 56
const BUILDINGS: Array<[number, number, number]> = [
  [0, 54, 30],
  [58, 40, 44],
  [102, 64, 34],
  [170, 44, 50],
  [218, 70, 32],
  [292, 48, 46],
  [344, 60, 38],
  [408, 42, 52],
  [454, 66, 30],
  [524, 52, 42],
  [580, 46, 48],
  [630, 70, 34],
  [704, 44, 50],
  [752, 62, 28],
  [818, 50, 44],
  [872, 66, 36],
  [942, 44, 50],
  [990, 58, 32],
  [1052, 50, 46],
  [1106, 44, 38],
  [1154, 46, 40],
]

// [posição, raio da copa]
const TREES_HEIGHT = 50
const TREES: Array<[number, number]> = [
  [40, 14],
  [130, 11],
  [215, 15],
  [310, 12],
  [420, 14],
  [500, 10],
  [610, 15],
  [705, 12],
  [800, 14],
  [905, 11],
  [1010, 15],
  [1100, 12],
]

const FRONT_HEIGHT = 70
const POLES = [70, 470, 870]
// [posição, raio horizontal, raio vertical]
const BUSHES: Array<[number, number, number]> = [
  [170, 26, 14],
  [290, 18, 10],
  [560, 24, 12],
  [690, 30, 15],
  [980, 22, 12],
  [1100, 28, 14],
]
// O fio pende entre postes vizinhos; o trecho que cruza a emenda dos blocos é desenhado nos dois.
const WIRE = 'M70 16 Q270 36 470 16 Q670 36 870 16 Q1070 36 1270 16 M-330 16 Q-130 36 70 16'

/** Janelinhas de um prédio, num único caminho; algumas ficam apagadas para não parecer grade. */
function windowsPath([x, width, height]: [number, number, number]): string {
  const columns = Math.floor((width - 8) / 10)
  const rows = Math.floor((height - 8) / 12)
  let path = ''
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      if ((x + column * 7 + row * 3) % 5 === 0) {
        continue
      }
      path += `M${x + 6 + column * 10} ${BUILDINGS_HEIGHT - height + 6 + row * 12}h4v5h-4z`
    }
  }
  return path
}

function Tile({ height, children }: { height: number; children: ReactNode }) {
  return (
    <svg
      className="cena-bloco"
      viewBox={`0 0 ${TILE_WIDTH} ${height}`}
      width={TILE_WIDTH}
      height={height}
    >
      {children}
    </svg>
  )
}

function Layer({ name, height, children }: { name: string; height: number; children: ReactNode }) {
  return (
    <div className={`cena-camada cena-${name}`}>
      <Tile height={height}>{children}</Tile>
      <Tile height={height}>{children}</Tile>
    </div>
  )
}

function Bus() {
  return (
    <svg className="cena-onibus" viewBox="0 0 300 96" width={300} height={96}>
      <ellipse className="cena-sombra" cx="140" cy="92" rx="124" ry="4" />
      <path className="cena-farol-luz" d="M262 62 L300 52 L300 80 Z" />
      <g className="cena-carroceria">
        <rect className="cena-ar" x="70" y="8" width="70" height="8" rx="3" />
        <rect className="cena-corpo" x="10" y="14" width="250" height="62" rx="12" />
        <rect className="cena-faixa-cor" x="11" y="52" width="248" height="10" />
        {[24, 60, 96, 132].map((x) => (
          <rect key={x} className="cena-vidro" x={x} y="24" width="30" height="22" rx="3" />
        ))}
        <rect className="cena-porta" x="172" y="24" width="28" height="50" rx="3" />
        <rect className="cena-divisoria" x="185" y="24" width="2" height="50" />
        <path className="cena-vidro" d="M208 24 H246 Q256 24 256 36 V48 H208 Z" />
        <rect className="cena-espelho" x="256" y="28" width="5" height="14" rx="2" />
        <rect className="cena-farol" x="252" y="60" width="8" height="8" rx="2" />
        <rect className="cena-lanterna" x="10" y="58" width="4" height="8" rx="1" />
        <rect className="cena-parachoque" x="254" y="70" width="8" height="5" rx="2" />
        <circle className="cena-cava" cx="60" cy="78" r="17" />
        <circle className="cena-cava" cx="214" cy="78" r="17" />
      </g>
      {[60, 214].map((x) => (
        <g key={x} className="cena-roda">
          <circle className="cena-pneu" cx={x} cy="78" r="14" />
          <path
            className="cena-raio"
            d={`M${x} 71V85M${x - 7} 78H${x + 7}M${x - 5} 73L${x + 5} 83M${x + 5} 73L${x - 5} 83`}
          />
          <circle className="cena-aro" cx={x} cy="78" r="3" />
        </g>
      ))}
    </svg>
  )
}

interface HeroSceneProps {
  /** Título da tela: o único texto da faixa, em h1, fora da camada decorativa. */
  title: string
}

/** Faixa de título com um ônibus viajando por uma estrada; o fundo é só enfeite (aria-hidden). */
function HeroScene({ title }: HeroSceneProps) {
  const reduced = useReducedMotion()
  const [paused, setPaused] = useState(false)

  return (
    <div className="cena" data-cena data-pausada={paused ? '' : undefined}>
      <div className="cena-fundo" aria-hidden="true">
        <span className="cena-astro" />
        <Layer name="montanha" height={MOUNTAINS_HEIGHT}>
          <path d={MOUNTAINS} />
        </Layer>
        <Layer name="predio" height={BUILDINGS_HEIGHT}>
          {BUILDINGS.map(([x, width, height]) => (
            <rect key={x} x={x} y={BUILDINGS_HEIGHT - height} width={width} height={height} />
          ))}
          <path className="cena-janelas" d={BUILDINGS.map(windowsPath).join('')} />
        </Layer>
        <Layer name="arvore" height={TREES_HEIGHT}>
          {TREES.map(([x, radius]) => (
            <g key={x}>
              <rect className="cena-tronco" x={x - 2} y={TREES_HEIGHT - 14} width="4" height="14" />
              <circle className="cena-copa" cx={x} cy={TREES_HEIGHT - 14 - radius + 4} r={radius} />
            </g>
          ))}
        </Layer>
        <Layer name="frente" height={FRONT_HEIGHT}>
          <path className="cena-fio" d={WIRE} />
          {POLES.map((x) => (
            <g key={x}>
              <rect x={x - 2} y="10" width="4" height="60" />
              <rect x={x - 12} y="14" width="24" height="3" />
            </g>
          ))}
          {BUSHES.map(([x, rx, ry]) => (
            <ellipse
              key={x}
              className="cena-arbusto"
              cx={x}
              cy={FRONT_HEIGHT - ry}
              rx={rx}
              ry={ry}
            />
          ))}
        </Layer>
        <div className="cena-estrada">
          <div className="cena-faixa" />
        </div>
        <Bus />
      </div>
      <div className="cena-conteudo">
        <h1>{title}</h1>
        {reduced ? null : (
          <button
            type="button"
            className="cena-pausa"
            aria-pressed={paused}
            onClick={() => setPaused((current) => !current)}
          >
            Pausar animação
          </button>
        )}
      </div>
    </div>
  )
}

export default HeroScene
