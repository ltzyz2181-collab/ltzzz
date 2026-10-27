// Same credential families as the BASE diff scanner; call on real bytes before JSON escaping.
export function credentialPattern(text){
 return typeof text==='string'&&/(?:^|[^A-Za-z0-9_-])(?:sk-|cfut_)[A-Za-z0-9_-]{16,}|(?:AKIA|ASIA)[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|client[_-]?secret|password|authorization)\s*[:=]\s*["'][A-Za-z0-9_+\/-]{20,}["']/i.test(text);
}
