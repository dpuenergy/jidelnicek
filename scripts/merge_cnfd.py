"""Merge base ingredients (generic, unbranded) with OFF-derived Czech products."""
import json, os

DIR = os.path.join(os.path.dirname(__file__), '..', 'shared')
OUT = os.path.normpath(os.path.join(DIR, 'cnfd.json'))

BASE = [
  {'name':'Kuřecí prsa (bez kůže)','kcal':165,'p':31.0,'c':0.0,'f':3.6,'cat':'Maso'},
  {'name':'Kuřecí stehno (bez kůže)','kcal':185,'p':26.0,'c':0.0,'f':9.0,'cat':'Maso'},
  {'name':'Krůtí prsa','kcal':135,'p':29.0,'c':0.0,'f':1.5,'cat':'Maso'},
  {'name':'Hovězí zadní','kcal':190,'p':28.0,'c':0.0,'f':8.0,'cat':'Maso'},
  {'name':'Hovězí mleté 10% tuku','kcal':176,'p':22.0,'c':0.0,'f':10.0,'cat':'Maso'},
  {'name':'Hovězí mleté 20% tuku','kcal':243,'p':20.0,'c':0.0,'f':18.0,'cat':'Maso'},
  {'name':'Vepřová panenka','kcal':143,'p':22.0,'c':0.0,'f':6.0,'cat':'Maso'},
  {'name':'Vepřové kotlety','kcal':185,'p':27.0,'c':0.0,'f':8.0,'cat':'Maso'},
  {'name':'Vepřový bůček (syrový)','kcal':518,'p':14.0,'c':0.0,'f':51.0,'cat':'Maso'},
  {'name':'Losos filet','kcal':208,'p':20.0,'c':0.0,'f':13.0,'cat':'Ryby'},
  {'name':'Treska filet','kcal':82,'p':18.0,'c':0.0,'f':0.7,'cat':'Ryby'},
  {'name':'Tuňák ve vodě (konzerva)','kcal':128,'p':28.0,'c':0.0,'f':1.0,'cat':'Ryby'},
  {'name':'Makrela filet','kcal':205,'p':19.0,'c':0.0,'f':14.0,'cat':'Ryby'},
  {'name':'Pangasius filet','kcal':83,'p':15.0,'c':0.0,'f':2.5,'cat':'Ryby'},
  {'name':'Krevety vařené','kcal':99,'p':21.0,'c':0.0,'f':1.1,'cat':'Ryby'},
  {'name':'Vejce celé','kcal':155,'p':13.0,'c':1.1,'f':11.0,'cat':'Vejce'},
  {'name':'Vaječný bílek','kcal':52,'p':11.0,'c':0.7,'f':0.2,'cat':'Vejce'},
  {'name':'Vaječný žloutek','kcal':322,'p':16.0,'c':3.6,'f':27.0,'cat':'Vejce'},
  {'name':'Tvaroh 0% tuku','kcal':76,'p':15.0,'c':3.3,'f':0.2,'cat':'Mléčné'},
  {'name':'Tvaroh 20% tuku','kcal':155,'p':14.0,'c':3.0,'f':10.0,'cat':'Mléčné'},
  {'name':'Řecký jogurt 0%','kcal':59,'p':10.0,'c':3.6,'f':0.4,'cat':'Mléčné'},
  {'name':'Řecký jogurt 10%','kcal':133,'p':9.0,'c':3.6,'f':9.7,'cat':'Mléčné'},
  {'name':'Bílý jogurt 2%','kcal':62,'p':5.0,'c':7.0,'f':1.5,'cat':'Mléčné'},
  {'name':'Mléko polotučné 1,5%','kcal':47,'p':3.3,'c':4.8,'f':1.5,'cat':'Mléčné'},
  {'name':'Mléko plnotučné 3,5%','kcal':61,'p':3.2,'c':4.7,'f':3.5,'cat':'Mléčné'},
  {'name':'Eidam 30%','kcal':260,'p':28.0,'c':0.0,'f':16.0,'cat':'Mléčné'},
  {'name':'Eidam 45%','kcal':338,'p':25.0,'c':0.0,'f':27.0,'cat':'Mléčné'},
  {'name':'Gouda','kcal':356,'p':25.0,'c':2.2,'f':28.0,'cat':'Mléčné'},
  {'name':'Cottage cheese','kcal':98,'p':11.0,'c':3.4,'f':4.3,'cat':'Mléčné'},
  {'name':'Skyr 0%','kcal':63,'p':11.0,'c':4.0,'f':0.2,'cat':'Mléčné'},
  {'name':'Čočka červená syrová','kcal':352,'p':26.0,'c':60.0,'f':1.1,'cat':'Luštěniny'},
  {'name':'Čočka vařená','kcal':116,'p':9.0,'c':20.0,'f':0.4,'cat':'Luštěniny'},
  {'name':'Cizrna vařená','kcal':164,'p':9.0,'c':27.0,'f':2.6,'cat':'Luštěniny'},
  {'name':'Fazole bílé vařené','kcal':127,'p':8.7,'c':22.8,'f':0.5,'cat':'Luštěniny'},
  {'name':'Tofu přírodní','kcal':76,'p':8.0,'c':1.9,'f':4.8,'cat':'Luštěniny'},
  {'name':'Rýže bílá vařená','kcal':130,'p':2.7,'c':28.2,'f':0.3,'cat':'Obiloviny'},
  {'name':'Rýže celozrnná vařená','kcal':112,'p':2.6,'c':23.5,'f':0.9,'cat':'Obiloviny'},
  {'name':'Těstoviny vařené vaječné','kcal':131,'p':5.0,'c':25.2,'f':1.1,'cat':'Obiloviny'},
  {'name':'Těstoviny celozrnné vařené','kcal':124,'p':5.3,'c':23.7,'f':1.0,'cat':'Obiloviny'},
  {'name':'Ovesné vločky','kcal':389,'p':17.0,'c':66.0,'f':7.0,'cat':'Obiloviny'},
  {'name':'Pohanka vařená','kcal':92,'p':3.4,'c':19.9,'f':0.6,'cat':'Obiloviny'},
  {'name':'Kuskus vařený','kcal':112,'p':3.8,'c':23.2,'f':0.2,'cat':'Obiloviny'},
  {'name':'Bulgur vařený','kcal':83,'p':3.1,'c':18.6,'f':0.2,'cat':'Obiloviny'},
  {'name':'Quinoa vařená','kcal':120,'p':4.4,'c':21.3,'f':1.9,'cat':'Obiloviny'},
  {'name':'Brambory vařené','kcal':77,'p':2.0,'c':17.0,'f':0.1,'cat':'Zelenina'},
  {'name':'Batáty vařené','kcal':86,'p':1.6,'c':20.1,'f':0.1,'cat':'Zelenina'},
  {'name':'Brokolice','kcal':34,'p':2.8,'c':7.0,'f':0.4,'cat':'Zelenina'},
  {'name':'Karfiol','kcal':25,'p':2.0,'c':5.0,'f':0.3,'cat':'Zelenina'},
  {'name':'Mrkev','kcal':41,'p':0.9,'c':10.0,'f':0.2,'cat':'Zelenina'},
  {'name':'Cuketa','kcal':17,'p':1.2,'c':3.1,'f':0.3,'cat':'Zelenina'},
  {'name':'Rajče','kcal':18,'p':0.9,'c':3.9,'f':0.2,'cat':'Zelenina'},
  {'name':'Paprika červená','kcal':31,'p':1.0,'c':6.0,'f':0.3,'cat':'Zelenina'},
  {'name':'Špenát čerstvý','kcal':23,'p':2.9,'c':3.6,'f':0.4,'cat':'Zelenina'},
  {'name':'Zelí bílé','kcal':25,'p':1.3,'c':5.8,'f':0.1,'cat':'Zelenina'},
  {'name':'Cibule','kcal':40,'p':1.1,'c':9.3,'f':0.1,'cat':'Zelenina'},
  {'name':'Česnek','kcal':149,'p':6.4,'c':33.1,'f':0.5,'cat':'Zelenina'},
  {'name':'Okurka salátová','kcal':15,'p':0.7,'c':3.6,'f':0.1,'cat':'Zelenina'},
  {'name':'Hrášek mražený','kcal':84,'p':5.4,'c':14.5,'f':0.4,'cat':'Zelenina'},
  {'name':'Kukuřice mražená','kcal':86,'p':3.3,'c':19.0,'f':1.2,'cat':'Zelenina'},
  {'name':'Žampióny','kcal':22,'p':3.1,'c':3.3,'f':0.3,'cat':'Zelenina'},
  {'name':'Jablko','kcal':52,'p':0.3,'c':14.0,'f':0.2,'cat':'Ovoce'},
  {'name':'Banán','kcal':89,'p':1.1,'c':23.0,'f':0.3,'cat':'Ovoce'},
  {'name':'Pomeranč','kcal':47,'p':0.9,'c':12.0,'f':0.1,'cat':'Ovoce'},
  {'name':'Borůvky','kcal':57,'p':0.7,'c':14.5,'f':0.3,'cat':'Ovoce'},
  {'name':'Jahody','kcal':32,'p':0.7,'c':7.7,'f':0.3,'cat':'Ovoce'},
  {'name':'Hrozny','kcal':67,'p':0.6,'c':17.2,'f':0.4,'cat':'Ovoce'},
  {'name':'Olivový olej','kcal':884,'p':0.0,'c':0.0,'f':100.0,'cat':'Tuky'},
  {'name':'Řepkový olej','kcal':884,'p':0.0,'c':0.0,'f':100.0,'cat':'Tuky'},
  {'name':'Máslo','kcal':717,'p':0.9,'c':0.1,'f':81.0,'cat':'Tuky'},
  {'name':'Avokádo','kcal':160,'p':2.0,'c':9.0,'f':15.0,'cat':'Tuky'},
  {'name':'Mandle','kcal':579,'p':21.0,'c':22.0,'f':50.0,'cat':'Ořechy'},
  {'name':'Vlašské ořechy','kcal':654,'p':15.0,'c':14.0,'f':65.0,'cat':'Ořechy'},
  {'name':'Arašídové máslo 100%','kcal':588,'p':25.0,'c':20.0,'f':50.0,'cat':'Ořechy'},
  {'name':'Syrovátkový protein (whey)','kcal':400,'p':75.0,'c':10.0,'f':5.0,'cat':'Doplňky'},
]

with open(OUT, encoding='utf-8') as f:
    off_data = json.load(f)

base_keys = {x['name'].lower() for x in BASE}
off_filtered = [x for x in off_data if x['name'].lower() not in base_keys]
merged = BASE + off_filtered

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(merged, f, ensure_ascii=False, separators=(',', ':'))

size_kb = os.path.getsize(OUT) / 1024
print(f'Base: {len(BASE)}, OFF: {len(off_filtered)}, Total: {len(merged)}, Size: {size_kb:.0f} KB')
