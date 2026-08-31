/**
 * NotiFetch hero — static QR pattern rendered as a 15×15 grid (matches the
 * live deployment byte-for-byte). Data, not 225 hand-written spans.
 */
export const QR_GRID: string[] = [
  '#######.###.###',
  '#.....#.#...#..',
  '#.###.#.###.#.#',
  '#.###.#...#.#.#',
  '#.###.#.###.#.#',
  '#.....#..#..#..',
  '#######.#.#.###',
  '.......##.#...#',
  '##.#.##..#.###.',
  '.##.#..#.##.#..',
  '#..#.##.##.#.##',
  '.#.##.#..##..#.',
  '###.#..##..##.#',
  '#...#.##.#..#.#',
  '#######.##.##.#',
]

export function QrGrid() {
  return (
    <div
      className="grid gap-px rounded-lg bg-white p-2 shadow-sm"
      style={{ gridTemplateColumns: 'repeat(15, minmax(0,1fr))' }}
      aria-hidden="true"
    >
      {QR_GRID.flatMap((row, y) =>
        row.split('').map((cell, x) => (
          <span
            key={`${y}-${x}`}
            className={`aspect-square w-[7px] ${cell === '#' ? 'bg-stone-900' : 'bg-white'}`}
          />
        )),
      )}
    </div>
  )
}
