# Text diff of two built pages / PDFs / JSON (for the live-text diff before 'ok push').
#   python3 tools/textdiff.py <old file> <new file>     (.html → visible text, .pdf → pypdf text, .json → pretty JSON)
import re,html,sys,difflib,json
def t(p):
    s="" if p.endswith(".pdf") else open(p,encoding="utf8").read()
    if p.endswith('.pdf'):
        import pypdf; return '\n'.join(pg.extract_text() for pg in pypdf.PdfReader(p).pages).split('\n')
    if p.endswith('.json'):
        return json.dumps(json.load(open(p)),indent=1,ensure_ascii=False).split('\n')
    s=re.sub(r'(?s)<(style)[^>]*>.*?</\1>','',s)
    s=re.sub(r'<(tr|br|li|h\d|p|div|td|th|details|summary)[^>]*>','\n',s); s=re.sub(r'<[^>]+>','',s); s=html.unescape(s)
    s=re.sub(r'\\u003c|\\n',' ',s)
    out=[]
    for l in s.split('\n'):
        l=l.strip()
        if not l: continue
        # split long script lines into sentence-ish chunks
        out+= [x for x in re.split(r'(?<=[.;,}\]])\s*(?=["{\[])',l) if x.strip()] if len(l)>300 else [l]
    return out
a,b=t(sys.argv[1]),t(sys.argv[2])
for l in difflib.unified_diff(a,b,lineterm='',n=0):
    if l.startswith(('---','+++')): continue
    print(l[:400])
