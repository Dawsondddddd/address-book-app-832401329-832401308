"""生成导入功能测试用的 Excel / CSV 文件（仅开发测试使用）"""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
import csv
import os

base = os.path.dirname(os.path.abspath(__file__))

wb = Workbook()
ws = wb.active
ws.title = "通讯录"

headers = ["姓名", "公司", "职位", "手机", "邮箱", "微信", "备注", "是否收藏"]
rows = [
    ["林晚晴", "字节跳动", "产品经理", "13800138000", "wanqing.lin@bytedance.com", "wanqing_l", "重复联系人测试", "是"],
    ["孙一鸣", "滴滴出行", "算法工程师", "13911112222", "sunym@didiglobal.com", "sunym_dd", "实习面试认识", "是"],
    ["罗嘉", "美的集团", "工业设计", "", "luojia@midea.com", "luojia_design", "", "否"],
    ["", "", "缺姓名测试", "13700003333", "", "", "", "否"],
]

ws.append(headers)
for cell in ws[1]:
    cell.font = Font(bold=True, color="FFFFFF")
    cell.fill = PatternFill("solid", fgColor="4F46E5")
    cell.alignment = Alignment(horizontal="center")

for row in rows:
    ws.append(row)
    for cell in ws[ws.max_row]:
        cell.alignment = Alignment(vertical="center")

for col, width in zip("ABCDEFGH", [12, 16, 14, 16, 28, 16, 22, 10]):
    ws.column_dimensions[col].width = width

wb.save(os.path.join(base, "import-demo.xlsx"))

with open(os.path.join(base, "import-demo.csv"), "w", encoding="utf-8-sig", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["姓名", "公司", "职位", "手机", "邮箱", "备注"])
    writer.writerow(["蔡明轩", "美团", "数据分析师", "13612345678", "caimx@meituan.com", "社团学长"])
    writer.writerow(["顾晓", "厦门航空", "乘务长", "13511119999", "guxiao@xiamenair.com", "含逗号, 的备注"])

print("已生成 import-demo.xlsx / import-demo.csv")
