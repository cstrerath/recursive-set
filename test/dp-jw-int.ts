import { RecursiveSet, Value } from '../src/index';

// ============================================================================
// TYPEN: Jetzt alles number!
// ============================================================================
// Variable: Positive Integer (1, 2, 3...)
export type Variable = number;
// Literal: Integer (!= 0). Positiv = Variable, Negativ = Negierte Variable.
export type Literal = number;
export type Clause = RecursiveSet<Literal>;

// ============================================================================
// HELPER (Jetzt O(1) und allocation-free)
// ============================================================================

// Negation ist einfach Vorzeichenwechsel
export function complement(l: Literal): Literal {
  return -l;
}

// Variable extrahieren ist Absolutwert
export function extractVariable(l: Literal): Variable {
  return Math.abs(l);
}

// ============================================================================
// HEURISTIK (JW) - Optimiert für Numbers
// ============================================================================
// ... imports ...

export function selectLiteral(
  Clauses: RecursiveSet<Clause>,
  Variables: RecursiveSet<Variable>,
  UsedVars: RecursiveSet<Variable>
): Literal {
  // Map Variable -> [ScorePos, ScoreNeg]
  // Wir nutzen ein Array [number, number] als Value für Speed
  const scores = new Map<Variable, [number, number]>();

  for (const clause of Clauses) {
    const w = Math.pow(2, -clause.size); 
    
    for (const lit of clause) {
      const v = Math.abs(lit);
      const isNeg = lit < 0;
      
      let s = scores.get(v);
      if (!s) {
          s = [0, 0];
          scores.set(v, s);
      }
      
      // Index 0 für Positiv, 1 für Negativ
      if (isNeg) s[1] += w;
      else s[0] += w;
    }
  }

  let bestVar: Variable | null = null;
  let bestScore = -1;
  let pickNeg = false; // Sollten wir das Literal negieren?

  for (const v of Variables) {
    if (UsedVars.has(v)) continue;
    
    const [pos, neg] = scores.get(v) || [0, 0];
    
    // Check Positiv
    if (pos > bestScore) {
      bestScore = pos;
      bestVar = v;
      pickNeg = false;
    }
    
    // Check Negativ
    if (neg > bestScore) {
      bestScore = neg;
      bestVar = v;
      pickNeg = true;
    }
  }

  // Fallback: Nimm das erste verfügbare
  if (bestVar === null) {
      for(const v of Variables) if(!UsedVars.has(v)) return v; 
      return 1;
  }

  // WICHTIG: Gib das Literal mit dem besseren Vorzeichen zurück!
  return pickNeg ? -bestVar : bestVar;
}

// ... Rest wie gehabt (complement, extractVariable etc.) ...

// ============================================================================
// REDUCE & SATURATE
// ============================================================================

// Hilfsfunktion für Saturate (First Element Access)
function pickFirst<T>(S: RecursiveSet<Value>): Value | null {
    for (const val of S) return val;
    return null;
}

export function reduce(Clauses: RecursiveSet<Clause>, l: Literal): RecursiveSet<Clause> {
  const lBar = -l; // Complement ist billig
  const out: Clause[] = [];

  for (const clause of Clauses) {
    // 1. Check: Klausel ist wahr? (Enthält l)
    if (clause.has(l)) continue; // Drop clause

    // 2. Check: Klausel enthält lBar? (Muss entfernt werden)
    if (clause.has(lBar)) {
        // Wir müssen lBar entfernen.
        // Da 'clause' immutable ist, nutzen wir einen optimierten Weg.
        // Wir wissen: Clause ist sortiert. Wenn wir lBar entfernen, bleibt der Rest sortiert.
        
        const kept: Literal[] = [];
        for(const lit of clause) {
            if(lit !== lBar) kept.push(lit);
        }
        
        // Wenn Klausel leer wird -> Leere Klausel erzeugen (Konflikt)
        out.push(RecursiveSet.fromSortedUnsafe(kept) as Clause);
    } else {
        // Klausel bleibt unverändert
        out.push(clause);
    }
  }
  
  // Unit Klausel hinzufügen
  out.push(RecursiveSet.fromSortedUnsafe([l]) as Clause);

  return RecursiveSet.fromArray(out);
}

export function saturate(Clauses: RecursiveSet<Clause>): RecursiveSet<Clause> {
  let S = Clauses;
  const Used = new RecursiveSet<Clause>(); 
  
  while (true) {
    let unitClause: Clause | null = null;
    
    // Finde erste Unit-Clause (Depth First)
    for (const C of S) {
        const clause = C as Clause;
        if (clause.size === 1 && !Used.has(clause)) {
            unitClause = clause;
            break; 
        }
    }

    if (!unitClause) break;

    Used.add(unitClause);
    const l = pickFirst(unitClause) as Literal; 
    S = reduce(S, l);
    
    // OPTIMIERUNG: Early Exit bei Konflikt
    // Wenn leere Klausel entstanden ist, sofort raus.
    // Eine leere Klausel hat HashCode X (fix).
    // Wir checken einfach size.
    for(const C of S) {
        if((C as Clause).isEmpty()) return S; // Enthält leere Klausel -> Unsat
    }
  }
  return S;
}

// ============================================================================
// SOLVER
// ============================================================================

export function solveRecursive(
  Clauses: RecursiveSet<Clause>,
  Variables: RecursiveSet<Variable>,
  UsedVars: RecursiveSet<Variable>
): RecursiveSet<Clause> {
  const S = saturate(Clauses);
  
  // Check auf leere Klausel (Konflikt)
  // Da RecursiveSet unique ist, gibt es genau EINE Instanz der leeren Klausel.
  // Wir iterieren kurz, das ist bei gesättigten Sets oft schnell.
  for(const C of S) {
      if((C as Clause).isEmpty()) {
          // Konflikt! Rückgabe eines Sets, das die leere Klausel enthält.
          return RecursiveSet.fromSortedUnsafe([C]) as unknown as RecursiveSet<Clause>;
      }
  }

  // Check ob fertig (Nur noch Units)
  let allUnits = true;
  for (const C of S) {
    if ((C as Clause).size !== 1) {
      allUnits = false;
      break;
    }
  }
  if (allUnits) return S;

  // Branching
  const l = selectLiteral(S, Variables, UsedVars);
  const p = Math.abs(l);
  
  const nextUsedVars = UsedVars.mutableCopy();
  nextUsedVars.add(p);

  // Branch 1: l = True
  const cL = RecursiveSet.fromSortedUnsafe([l]) as Clause; 
  const S_plus_l = S.mutableCopy();
  S_plus_l.add(cL); 

  const Result1 = solveRecursive(S_plus_l, Variables, nextUsedVars);
  
  // Check Result1 auf leere Klausel
  let hasEmpty = false;
  for(const C of Result1) {
      if((C as Clause).isEmpty()) { hasEmpty = true; break; }
  }
  
  if (!hasEmpty) return Result1;

  // Branch 2: l = False (also -l = True)
  const lBar = -l;
  const cLBar = RecursiveSet.fromSortedUnsafe([lBar]) as Clause;
  const S_plus_lBar = S.mutableCopy();
  S_plus_lBar.add(cLBar);

  return solveRecursive(S_plus_lBar, Variables, nextUsedVars);
}

export function solve(Clauses: RecursiveSet<Clause>): RecursiveSet<Clause> {
  const Variables = new RecursiveSet<Variable>();
  for (const clause of Clauses) {
    for (const lit of clause) {
      Variables.add(Math.abs(lit));
    }
  }
  const UsedVars = new RecursiveSet<Variable>();
  return solveRecursive(Clauses, Variables, UsedVars);
}