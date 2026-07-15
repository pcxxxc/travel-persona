import pytesseract
from PIL import Image
pytesseract.pytesseract.tesseract_cmd = r"C:\Users\pingc\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\vm\tools\bin\tesseract.cmd"
img = Image.open(r"c:\Users\pingc\Desktop\travel\.ocr_temp2.png")
data = pytesseract.image_to_data(img, lang="chi_sim", output_type=pytesseract.Output.DICT)
for i in range(len(data["text"])):
    text = data["text"][i].strip()
    if text and int(data["conf"][i]) > 0:
        print("Conf:" + str(data["conf"][i]) + " | Text:" + text + " | Block:" + str(data["block_num"][i]) + " Line:" + str(data["line_num"][i]))
