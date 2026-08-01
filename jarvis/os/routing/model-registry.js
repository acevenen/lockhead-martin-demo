import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = resolve(HERE, '..', 'config', 'model-profiles.json');

// The model registry knows about profiles (roles like `coding_primary`), not
// concrete model ids. The concrete id is resolved from an env var at call time,
// so models can change without touching code (directive §10).
export class ModelRegistry {
  constructor(config) {
    this.policyVersion = config.policy_version ?? '0';
    this.profiles = config.profiles ?? {};
  }

  static load(path = DEFAULT_CONFIG) {
    return new ModelRegistry(JSON.parse(readFileSync(path, 'utf8')));
  }

  has(name) {
    return !!this.profiles[name];
  }

  get(name) {
    const p = this.profiles[name];
    if (!p) throw new Error(`unknown model profile: ${name}`);
    return p;
  }

  names() {
    return Object.keys(this.profiles);
  }

  /** Resolve the concrete model id for a profile from its env var (or null). */
  resolveModel(name) {
    const p = this.get(name);
    return process.env[p.model_env] ?? null;
  }

  /** Whether a profile is allowed to handle a given task risk level. */
  allowsRisk(name, risk) {
    return (this.get(name).allowed_risk || []).includes(risk);
  }

  /** Whether a profile is safe for the given data-egress requirement. */
  allowsEgress(name, requireLocal) {
    return requireLocal ? this.get(name).privacy === 'local' : true;
  }
}
