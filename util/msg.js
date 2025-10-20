export function base(role, ...parts) {
    return {
        role,
        content: parts.join(' '),
    }
}

export function system(...parts) {
    return base('system', ...parts)
}

export function user(...parts) {
    return base('user', ...parts)
}

export function assistant(...parts) {
    return base('assistant', ...parts)
}
