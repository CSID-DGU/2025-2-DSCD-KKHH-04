import numpy as np
import cv2
from pathlib import Path

PROC_DIR = Path("dataset/processed")

def draw_one(frame126, scale=512):
    # frame126: [126] => 왼손 63, 오른손 63
    img = np.ones((scale, scale, 3), dtype=np.uint8)*255
    def draw_hand(vec63, color):
        pts = []
        for i in range(21):
            x = vec63[i*3+0]; y = vec63[i*3+1]
            px = int(x*scale); py = int(y*scale)
            pts.append((px,py))
            cv2.circle(img, (px,py), 3, color, -1)
        # 간단 연결(손가락 뼈대)
        bones = [
            [0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],
            [9,13,14,15,16],[13,17,18,19,20],[0,17]
        ]
        for chain in bones:
            for a,b in zip(chain, chain[1:]):
                cv2.line(img, pts[a], pts[b], color, 1)
    left = frame126[:63]; right = frame126[63:]
    draw_hand(left, (0,0,255))
    draw_hand(right,(0,150,0))
    return img

def main(stem="hello_0001"):
    arr = np.load(PROC_DIR / f"{stem}.npz")["seq"]  # [T,126]
    for i in range(0, arr.shape[0], max(1, arr.shape[0]//100)):
        im = draw_one(arr[i])
        cv2.imshow("seq", im)
        if cv2.waitKey(10) == 27: break
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
