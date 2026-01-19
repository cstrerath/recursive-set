import { RecursiveSet, Value } from '../src/strict-tree';

export type Variable = string;
export type Literal = Variable | ['¬', Variable];
export type Clause = RecursiveSet<Literal>;

export function complement(l: Literal): Literal {
  if (Array.isArray(l)) {
    return l[1];
  } else {
    return ['¬', l];
  }
}

export function extractVariable(l: Literal): Variable {
  if (Array.isArray(l)) {
    return l[1];
  } else {
    return l;
  }
}

function sameLiteral(a: Literal, b: Literal): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a[0] === '¬' && b[0] === '¬' && a[1] === b[1];
  }
  return !Array.isArray(a) && !Array.isArray(b) && a === b;
}

function arb<T extends Value>(S: RecursiveSet<T>): T | null {
    if (S.isEmpty()) {
        return null;
    }
    return S.pickRandom();
}

export function selectLiteral(
  Clauses: RecursiveSet<Clause>,
  Variables: RecursiveSet<Variable>,
  UsedVars: RecursiveSet<Variable>
): Literal {
  // Cache weight by clause size
  const weightCache = new Map<number, number>();

  // Scores: variable -> [posScore, negScore]
  const scores = new Map<Variable, [number, number]>();

  for (const clause of Clauses) {
    const size = clause.size;
    let w = weightCache.get(size);
    if (w === undefined) {
      w = Math.pow(2, -size);
      weightCache.set(size, w);
    }

    for (const lit of clause) {
      if (Array.isArray(lit)) {
        const v = lit[1];
        const s = scores.get(v) ?? [0, 0];
        s[1] += w; // neg
        scores.set(v, s);
      } else {
        const v = lit;
        const s = scores.get(v) ?? [0, 0];
        s[0] += w; // pos
        scores.set(v, s);
      }
    }
  }

  // pick best literal among unused vars
  let bestVar: Variable | null = null;
  let bestIsNeg = false;
  let bestScore = -Infinity;

  for (const v of Variables) {
    if (UsedVars.has(v)) continue;
    const [pos, neg] = scores.get(v) ?? [0, 0];
    if (pos > bestScore) { bestScore = pos; bestVar = v; bestIsNeg = false; }
    if (neg > bestScore) { bestScore = neg; bestVar = v; bestIsNeg = true; }
  }

  if (bestVar === null) return Array.from(Variables)[0] ?? 'x';
  return bestIsNeg ? ['¬', bestVar] : bestVar;
}


// Hilfsfunktion: Schneller Zugriff auf das erste Element (statt Random)
function pickFirst<T extends Value>(S: RecursiveSet<T>): T | null {
    // Der Iterator im AVL Tree ist lazy. 
    // Er geht nur bis zum ersten Knoten runter -> O(log N) statt O(N) für .raw
    for (const val of S) {
        return val;
    }
    return null;
}

export function reduce(Clauses: RecursiveSet<Clause>, l: Literal): RecursiveSet<Clause> {
  const lBar = complement(l);

  // Optimierung: Wir wissen ungefähr wie groß das Resultat ist, aber Arrays wachsen in JS eh dynamisch.
  const out: Clause[] = [];

  for (const clause of Clauses) {
    let satisfied = false;
    let removedAny = false;
    const kept: Literal[] = [];

    // Hot Path Optimierung: sameLiteral inline checken spart Function Call Overhead
    // Wir wissen hier dank Types, was Literal ist.
    const isLArray = Array.isArray(l);
    const lVal = isLArray ? l[1] : l;
    
    // lBar vorbereiten
    const isLBarArray = Array.isArray(lBar);
    const lBarVal = isLBarArray ? lBar[1] : lBar;

    for (const lit of clause) {
      // Inline sameLiteral(lit, l)
      // Check: Ist lit identisch zu l?
      if (lit === l) { // String Compare oder Referenz (bei Tuple)
          satisfied = true; 
          break;
      }
      if (Array.isArray(lit) && isLArray && lit[1] === lVal) {
           // Beide sind Arrays ['¬', 'X'], Variable gleich?
           satisfied = true;
           break;
      }
      
      // Inline sameLiteral(lit, lBar)
      let matchLBar = false;
      if (lit === lBar) matchLBar = true;
      else if (Array.isArray(lit) && isLBarArray && lit[1] === lBarVal) matchLBar = true;

      if (matchLBar) {
        removedAny = true;
        continue;
      }
      kept.push(lit);
    }

    if (satisfied) continue;

    if (removedAny) {
        // PERFORMANCE WIN #1: 
        // kept stammt aus einem sortierten Set und wir haben nur gelöscht.
        // Die Reihenfolge ist erhalten -> Unsafe Construction!
        out.push(RecursiveSet.fromSortedUnsafe(kept) as Clause);
    } else {
        out.push(clause);
    }
  }

  // add unit clause {l}
  // Ein einzelnes Element ist trivialerweise sortiert
  out.push(RecursiveSet.fromSortedUnsafe([l]) as Clause);

  // PERFORMANCE WIN #2:
  // Wir können hier nicht fromSortedUnsafe nehmen, da sich durch die Modifikationen
  // die Hashes der Klauseln geändert haben könnten -> Sortierung von 'out' ist nicht garantiert.
  // Aber fromArray ist hier unvermeidbar für das äußere Set.
  return RecursiveSet.fromArray(out);
}

export function saturate(Clauses: RecursiveSet<Clause>): RecursiveSet<Clause> {
  let S = Clauses;
  const Used = new RecursiveSet<Clause>(); // AVL Tree overhead is okay here
  
  while (true) {
    // PERFORMANCE WIN #3: Kein Random mehr.
    // Suche Unit Clauses. 
    let unitClause: Clause | null = null;
    
    // Wir iterieren durch S. Sobald wir eine Unit finden, die wir noch nicht hatten, nehmen wir sie.
    // Wir bauen KEIN 'Units' Set mehr auf. Das spart O(N) Allokationen pro Loop.
    for (const C of S) {
        const clause = C as Clause;
        if (clause.size === 1 && !Used.has(clause)) {
            unitClause = clause;
            break; // Sofort nehmen (Depth First Propagation)
        }
    }

    if (!unitClause) {
      break;
    }

    Used.add(unitClause);
    // pickFirst ist O(1) bis O(log K), arb war random
    const l = pickFirst(unitClause) as Literal; 
    S = reduce(S, l);
  }
  return S;
}

export function solveRecursive(
  Clauses: RecursiveSet<Clause>,
  Variables: RecursiveSet<Variable>,
  UsedVars: RecursiveSet<Variable>
): RecursiveSet<Clause> {
  const S = saturate(Clauses);
  const EmptyClause = new RecursiveSet<Literal>();
  
  // Quick Check: Contains empty clause?
  if (S.has(EmptyClause)) {
     // Wir können { {} } direkt zurückgeben
     return RecursiveSet.fromSortedUnsafe([EmptyClause]) as unknown as RecursiveSet<Clause>;
  }

  // Check if all units (Solution found)
  let allUnits = true;
  for (const C of S) {
    if ((C as Clause).size !== 1) {
      allUnits = false;
      break;
    }
  }
  if (allUnits) return S;

  const l = selectLiteral(S, Variables, UsedVars);
  const lBar = complement(l);
  const p = extractVariable(l);
  
  // Optimierung: Variables sind primitive Strings. 
  // Das Erstellen eines Sets für Union ist okay, aber add ist billiger.
  // const nextUsedVars = UsedVars.union(new RecursiveSet<Variable>(p));
  // BESSER: copy + add
  const nextUsedVars = UsedVars.mutableCopy();
  nextUsedVars.add(p);

  // PERFORMANCE WIN #4: S.union(unitL) ersetzen durch copy & add
  // Branch 1: Setze l wahr
  // Wir erstellen kein unitL Set mehr, sondern fügen direkt in S ein.
  
  // Klausel {l}
  const cL = RecursiveSet.fromSortedUnsafe([l]) as Clause; 
  
  const S_plus_l = S.mutableCopy();
  S_plus_l.add(cL); // Viel schneller als Union

  const Result1 = solveRecursive(S_plus_l, Variables, nextUsedVars);
  
  if (!Result1.has(EmptyClause)) {
    return Result1;
  }

  // Branch 2: Setze lBar wahr
  const cLBar = RecursiveSet.fromSortedUnsafe([lBar]) as Clause;
  
  const S_plus_lBar = S.mutableCopy();
  S_plus_lBar.add(cLBar);

  return solveRecursive(S_plus_lBar, Variables, nextUsedVars);
}

export function solve(Clauses: RecursiveSet<Clause>): RecursiveSet<Clause> {
  const Variables = new RecursiveSet<Variable>();
  for (const clause of Clauses) {
    for (const lit of clause) {
      Variables.add(extractVariable(lit));
    }
  }
  const UsedVars = new RecursiveSet<Variable>();
  return solveRecursive(Clauses, Variables, UsedVars);
}

export function literal_to_str(C: Clause): string {
  const val = arb(C);
  if (val === null) return "{}";
  const l = val as Literal;
  if (Array.isArray(l)) {
    return `${l[1]} ↦ False`;
  } else {
    return `${l} ↦ True`;
  }
}

export function prettify(Clauses: RecursiveSet<Clause>): string {
  const res: string[] = [];
  for (const C of Clauses) res.push(C.toString());
  return `{${res.join(', ')}}`;
}

export function toString(S: RecursiveSet<Clause>, Simplified: RecursiveSet<Clause>): string {
  const EmptyClause = new RecursiveSet<Literal>();
  if (Simplified.has(EmptyClause)) {
    return `${prettify(S)} is unsolvable`;
  }
  const parts: string[] = [];
  for (const C of Simplified) {
    parts.push(literal_to_str(C as Clause));
  }
  return '{ ' + parts.join(', ') + ' }';
}