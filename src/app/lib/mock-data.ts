
export interface Signal {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  entry: number;
  tp: number;
  sl: number;
  timestamp: string;
  source: string;
  status: 'active' | 'hit' | 'stopped';
}

export const MOCK_SIGNALS: Signal[] = [
  {
    id: '1',
    symbol: 'BTCUSDT',
    type: 'BUY',
    entry: 98500,
    tp: 105000,
    sl: 96000,
    timestamp: '2024-05-20T10:30:00Z',
    source: 'RSI Divergence',
    status: 'active'
  },
  {
    id: '2',
    symbol: 'ETHUSDT',
    type: 'SELL',
    entry: 3850,
    tp: 3500,
    sl: 4000,
    timestamp: '2024-05-20T09:15:00Z',
    source: 'Bollinger Breakout',
    status: 'active'
  },
  {
    id: '3',
    symbol: 'SOLUSDT',
    type: 'BUY',
    entry: 175.5,
    tp: 195,
    sl: 168,
    timestamp: '2024-05-19T22:45:00Z',
    source: 'MACD Golden Cross',
    status: 'hit'
  },
  {
    id: '4',
    symbol: 'LINKUSDT',
    type: 'SELL',
    entry: 18.2,
    tp: 15.5,
    sl: 19.5,
    timestamp: '2024-05-19T18:20:00Z',
    source: 'Trend Reversal',
    status: 'stopped'
  }
];

export const WATCHLIST = [
  { symbol: 'BTC/USDT', price: '98,432.50', change: '+2.45%' },
  { symbol: 'ETH/USDT', price: '3,845.21', change: '-1.12%' },
  { symbol: 'SOL/USDT', price: '178.90', change: '+5.67%' },
  { symbol: 'LINK/USDT', price: '17.45', change: '-0.32%' },
  { symbol: 'DOT/USDT', price: '7.21', change: '+1.05%' },
  { symbol: 'ADA/USDT', price: '0.456', change: '-2.10%' },
];
