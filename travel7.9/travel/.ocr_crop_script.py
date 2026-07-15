from PIL import Image, ImageEnhance
img = Image.open(r"c:\Users\pingc\.trae-cn\attachments\6a317753a7b606b7d9f579b8\1097dce7-8458-4adb-ab7e-e686da9f71a0_6ecae2d2-dd34-4cc3-b15d-792209ad4ac2_image.png")
# Crop to the top half where the title likely is
title_crop = img.crop((0, 0, img.width, img.height // 2))
# Scale up 4x
w, h = title_crop.size
title_crop = title_crop.resize((w*4, h*4), Image.LANCZOS)
# Enhance
gray = title_crop.convert('L')
enhancer = ImageEnhance.Contrast(gray)
gray = enhancer.enhance(1.5)
gray.save(r"c:\Users\pingc\Desktop\travel\.ocr_title_crop.png")
print("Saved title crop:", gray.size)
