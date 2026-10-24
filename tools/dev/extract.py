import fitz,sys
d=fitz.open(sys.argv[1]); print(sys.argv[1], d.page_count, d.metadata.get('title'))
out=open(sys.argv[2],'w',encoding='utf-8')
for i,p in enumerate(d):
    out.write(f'\n=====PAGE {i+1}=====\n'); out.write(p.get_text())
