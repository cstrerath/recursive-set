import { Tuple, Value } from "./recursive-set";

// 1. UPDATE: '⊕' zum Typ hinzufügen
export type Variable = string;
export type Operator = '↔' | '→' | '⊕' | '∨' | '∧'; 
export type UnaryOp  = '¬';
export type ConstOp  = '⊤' | '⊥';

// --- Klassen (unverändert) ---

export class Constant extends Tuple<[ConstOp]> {
    constructor(val: ConstOp) {
        super(val);
    }
    
    get value(): ConstOp {
        return this.get(0) as ConstOp;
    }
}

export class Negation extends Tuple<['¬', Formula]> {
    constructor(phi: Formula) {
        super('¬', phi);
    }

    get phi(): Formula {
        return this.get(1) as Formula;
    }
}

export class BinaryFormula extends Tuple<[Operator, Formula, Formula]> {
    constructor(op: Operator, left: Formula, right: Formula) {
        super(op, left, right);
    }

    get operator(): Operator {
        return this.get(0) as Operator;
    }

    get left(): Formula {
        return this.get(1) as Formula;
    }

    get right(): Formula {
        return this.get(2) as Formula;
    }
}

export type Formula = Variable | Constant | Negation | BinaryFormula;

// --- Lexer ---

const lexSpec = /([ \t]+)|([A-Za-z][A-Za-z0-9<>,]*)|([⊤⊥∧∨¬→↔⊕()])/g;

function tokenize(s: string): string[] {
    return Array.from(s.matchAll(lexSpec))
        .map(([_, ws, identifier, operator]) => identifier || operator)
        .filter((token): token is string => !!token);
}

function isPropVar(s: string): boolean {
    return /^[A-Za-z][A-Za-z0-9<>,]*$/.test(s);
}

// --- Parser ---

export class LogicParser {
    private tokens: string[];
    private operators: string[];
    private argumentsList: Formula[];
    private input: string;

    constructor(s: string) {
        this.tokens = tokenize(s).reverse();
        this.operators = [];
        this.argumentsList = [];
        this.input = s;
    }

    parse(): Formula {
        while (this.tokens.length !== 0) {
            const nextOp = this.tokens.pop()!;
            
            if (isPropVar(nextOp)) {
                this.argumentsList.push(nextOp);
                continue;
            }
            if (nextOp === '⊤' || nextOp === '⊥') {
                this.operators.push(nextOp);
                continue;
            }
            if (this.operators.length === 0 || nextOp === '(') {
                this.operators.push(nextOp);
                continue;
            }
            
            const stackOp = this.operators[this.operators.length - 1];
            if (stackOp === '(' && nextOp === ')') {
                this.operators.pop();
            } else if (nextOp === ')' || this.evalBefore(stackOp, nextOp)) {
                this.popAndEvaluate();
                this.tokens.push(nextOp);
            } else {
                this.operators.push(nextOp);
            }
        }
        
        while (this.operators.length !== 0) {
            this.popAndEvaluate();
        }
        
        if (this.argumentsList.length !== 1) {
            throw new Error(`Could not parse: "${this.input}" - Result stack size: ${this.argumentsList.length}`);
        }
        
        return this.argumentsList.pop()!;
    }

    private evalBefore(stackOp: string, nextOp: string): boolean {
        if (stackOp === '(') return false;
        
        // UPDATE: Precedences exakt wie im Python Code
        const precedences: { [key: string]: number } = {
            '↔': 1, 
            '→': 2, 
            '⊕': 3, // Python Level 3
            '∨': 4, 
            '∧': 5, 
            '¬': 6, 
            '⊤': 7, 
            '⊥': 7
        };
        
        if (precedences[stackOp] > precedences[nextOp]) {
            return true;
        } else if (precedences[stackOp] === precedences[nextOp]) {
            if (stackOp === nextOp) {
                // UPDATE: Left-associative operators (Python set: {'∧', '∨', '⊕'})
                return ['∧', '∨', '⊕'].includes(stackOp);
            }
            return true;
        }
        return false;
    }

    private popAndEvaluate(): void {
        const op = this.operators.pop()!;

        switch (op) {
            case '⊤':
            case '⊥':
                this.argumentsList.push(new Constant(op));
                break;

            case '¬': {
                const arg = this.argumentsList.pop();
                if (!arg) throw new Error(`Missing argument for operator ${op}`);
                this.argumentsList.push(new Negation(arg));
                break;
            }

            // Binary Operators mit Switch-Case für Type Guard
            case '↔':
            case '→':
            case '⊕': // XOR hinzufügen
            case '∧':
            case '∨': { 
                const rhs = this.argumentsList.pop();
                const lhs = this.argumentsList.pop();
                
                if (!rhs || !lhs) {
                    throw new Error(`Missing argument(s) for binary operator ${op}`);
                }

                // TypeScript weiß hier: op ist Operator
                this.argumentsList.push(new BinaryFormula(op, lhs, rhs));
                break;
            }

            default:
                throw new Error(`Unknown or unexpected operator on stack: ${op}`);
        }
    }
}