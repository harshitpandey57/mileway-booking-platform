export type SeatKind = 'seater' | 'sleeper';
export interface LayoutSeat {
  number: string;
  deck: 'lower' | 'upper';
  row: number;
  col: number;
  kind: SeatKind;
  price: number;
}

export function makeLayout(kind: SeatKind, fare: number, count = kind === 'sleeper' ? 30 : 40): LayoutSeat[] {
  const width = kind === 'sleeper' ? 3 : 4;
  const lowerCount = kind === 'sleeper' ? Math.ceil(count / 2) : count;
  return Array.from({ length: count }, (_, index) => {
    const upper = index >= lowerCount;
    const position = upper ? index - lowerCount : index;
    const col = position % width;
    return {
      number: kind === 'sleeper' ? (upper ? 'U' : 'L') + (position + 1) : 'S' + (index + 1),
      deck: upper ? 'upper' : 'lower',
      row: Math.floor(position / width), col, kind,
      price: fare + (col === 0 ? 60 : 0)
    };
  });
}

export function rescaleLayout(seats: LayoutSeat[], fare: number): LayoutSeat[] {
  const minimum = Math.min(...seats.map(seat => seat.price));
  return seats.map(seat => ({
    number: seat.number, deck: seat.deck, row: seat.row, col: seat.col, kind: seat.kind,
    price: Math.round(fare * seat.price / minimum)
  }));
}
