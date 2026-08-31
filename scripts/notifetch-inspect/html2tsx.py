#!/usr/bin/env python3
"""
Convert live NotiFetch page markup into TSX-ready JSX fragments.

Usage: python3 html2tsx.py <input.html> <output.tsx> <main|body>
"""
import re
import sys
import html as H

SVG_ATTRS = {
    'stroke-width': 'strokeWidth',
    'stroke-linecap': 'strokeLinecap',
    'stroke-linejoin': 'strokeLinejoin',
    'fill-rule': 'fillRule',
    'clip-rule': 'clipRule',
    'stroke-dasharray': 'strokeDasharray',
    'stroke-dashoffset': 'strokeDashoffset',
    'fill-opacity': 'fillOpacity',
    'stroke-opacity': 'strokeOpacity',
}
BOOL_ATTRS = {'disabled', 'hidden', 'checked', 'readonly', 'required', 'autofocus', 'multiple', 'selected'}
VOID = {'img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'col', 'embed', 'track', 'wbr'}


def convert_tag_attrs(m: re.Match) -> str:
    tag = m.group(1)
    attrs = m.group(2)

    # strip data-nimg and optimizer srcset
    attrs = re.sub(r'\s(?:data-nimg|fetchpriority)="[^"]*"', '', attrs)
    attrs = re.sub(r'\ssrcSet="[^"]*"', '', attrs)
    attrs = re.sub(r'\ssrc="/_next/image\?url=([^&"]+)[^"]*"', lambda m: f' src="{H.unescape(m.group(1))}"', attrs)
    attrs = re.sub(r'\ssizes="[^"]*"', '', attrs)
    attrs = re.sub(r'\sloading="(lazy|eager)"', '', attrs)
    attrs = re.sub(r'\sdecoding="[^"]*"', '', attrs)

    # class → className (attribute position only)
    attrs = re.sub(r'\bclass="', 'className="', attrs)

    # boolean attrs: disabled="" → disabled
    for b in BOOL_ATTRS:
        attrs = re.sub(rf'\s{b}=""', f' {b}', attrs)

    # tabindex / for
    attrs = attrs.replace('tabindex=', 'tabIndex=')
    attrs = re.sub(r'\bfor="', 'htmlFor="', attrs)

    # svg attrs
    for raw, camel in SVG_ATTRS.items():
        attrs = attrs.replace(f'{raw}=', f'{camel}=')

    # style="a:b; c:d" → style={{ a: 'b', c: 'd' }}
    def style_repl(sm: re.Match) -> str:
        props = []
        for decl in sm.group(1).split(';'):
            if ':' in decl:
                k, v = decl.split(':', 1)
                k = k.strip()
                v = v.strip().replace("'", "\\'")
                kebab = '-'.join(k.lower().split())
                parts = kebab.split('-')
                camel_k = parts[0] + ''.join(p.capitalize() for p in parts[1:])
                props.append(f"{camel_k}: '{v}'")
        return f"style={{{{{', '.join(props)}}}}}"
    attrs = re.sub(r'style="([^"]*)"', style_repl, attrs)

    # void elements → self-closing
    if tag.lower() in VOID and not attrs.rstrip().endswith('/'):
        attrs = attrs.rstrip() + ' /'

    return f'<{tag}{attrs}>'


def escape_text_braces(html: str) -> str:
    """Escape { } only in text nodes (between > and <)."""
    def repl(m: re.Match) -> str:
        return m.group(0).replace('{', '&#123;').replace('}', '&#125;')
    return re.sub(r'>([^<]*)<', repl, html)


def main() -> None:
    src, dst, region = sys.argv[1], sys.argv[2], sys.argv[3]
    raw = open(src).read()
    body = re.sub(r'<script\b.*?</script>', '', raw.split('<body', 1)[1], flags=re.S)

    if region == 'main':
        m = re.search(r'<main[^>]*>(.*?)</main>', body, flags=re.S)
        frag = m.group(1) if m else ''
        if not frag:
            # scan page: take the first content div
            m2 = re.search(r'<div class="min-h-dvh.*?</div></div>', body, flags=re.S)
            frag = m2.group(0) if m2 else ''
    else:
        frag = body

    frag = frag.replace('<!-- -->', '')
    frag = re.sub(r'<(h[1-4]|p|div|section|a|button|span|ul|ol|li|table|thead|tbody|tr|th|td|figure|figcaption|blockquote|pre|code|nav|aside|strong|em|svg|path|circle|rect|line|polyline|polygon|g|header|footer|main|article|hgroup|label|input|textarea|select|option|time|small|hr|br)\b',
                  lambda m: m.group(0), frag)

    # convert tags
    frag = re.sub(r'<([a-zA-Z][a-zA-Z0-9]*)((?:[^>"\']|"[^"]*"|\'[^\']*\')*)>', convert_tag_attrs, frag)
    # close dangling void tags that had separate closing (shouldn't happen)
    frag = escape_text_braces(frag)

    open(dst, 'w').write(frag)
    print(f"{dst}: {len(frag)} bytes written")


if __name__ == '__main__':
    main()
