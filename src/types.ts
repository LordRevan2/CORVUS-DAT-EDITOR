export interface DatEntry {
  hash: number;
  key: string;
  text: string;
  translations?: Record<string, string>;
  originalIndex: number;
}
