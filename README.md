# HV Reset tutorial: 4K 60fps master

The video is split into byte-exact pieces (GitHub allows files up to 100 MB). Joining them gives back the
original file bit for bit. Nothing is re-encoded, so there is no quality loss.

3840x2160, 60 fps, 12:37, 383 MB.

## Join

Download all `.part` files into one folder, then run one of these in that folder:

**Windows (Command Prompt):**
```
copy /b HV_Reset_Tutorial_4K60.mp4.part00+HV_Reset_Tutorial_4K60.mp4.part01+HV_Reset_Tutorial_4K60.mp4.part02+HV_Reset_Tutorial_4K60.mp4.part03+HV_Reset_Tutorial_4K60.mp4.part04 HV_Reset_Tutorial_4K60.mp4
```

**Mac / Linux:**
```
cat HV_Reset_Tutorial_4K60.mp4.part* > HV_Reset_Tutorial_4K60.mp4
```

## Check (optional)

SHA-256 of the joined file: `bb62f4e47fc44bdc88b08a8c931d479968bb89fb488e114271407e8f33099400`

- Windows: `certutil -hashfile HV_Reset_Tutorial_4K60.mp4 SHA256`
- Mac: `shasum -a 256 HV_Reset_Tutorial_4K60.mp4`
