import numpy as np
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler
import tensorflow as tf
from tensorflow import keras
import re, subprocess, sys

WINDOW_SIZE = 50
STEP        = 25
SOS_THRESHOLD = 0.7

def parse_file(path):
    rows = []
    with open(path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('='):
                continue
            m = re.findall(r'A\d+:(\d+)', line)
            if len(m) >= 2:
                rows.append([int(m[0]), int(m[1])])
    return np.array(rows, dtype=np.float32)

print("데이터 로딩중...")
tap_data  = parse_file('tap_data.csv')
walk_data = parse_file('normal_data.csv')  # ← 수정

print(f"  탭 데이터:  {len(tap_data)} 샘플")
print(f"  일반 데이터: {len(walk_data)} 샘플")

scaler = MinMaxScaler()
all_data = np.vstack([tap_data, walk_data])
scaler.fit(all_data)

tap_norm  = scaler.transform(tap_data)
walk_norm = scaler.transform(walk_data)

scaler_min_a0   = float(scaler.data_min_[0])
scaler_min_a2   = float(scaler.data_min_[1])
scaler_range_a0 = float(scaler.data_max_[0] - scaler.data_min_[0])
scaler_range_a2 = float(scaler.data_max_[1] - scaler.data_min_[1])

print(f"\n  A0 정규화: min={scaler_min_a0:.1f}, range={scaler_range_a0:.1f}")
print(f"  A2 정규화: min={scaler_min_a2:.1f}, range={scaler_range_a2:.1f}")

def make_windows(data, label, window_size=WINDOW_SIZE, step=STEP):
    X, y = [], []
    for i in range(0, len(data) - window_size, step):
        X.append(data[i:i+window_size])
        y.append(label)
    return np.array(X), np.array(y)

X_tap,  y_tap  = make_windows(tap_norm,  label=1)
X_walk, y_walk = make_windows(walk_norm, label=0)

print(f"\n윈도우 샘플 수:")
print(f"  탭:   {len(X_tap)}")
print(f"  일반: {len(X_walk)}")

X = np.vstack([X_tap, X_walk])
y = np.hstack([y_tap, y_walk])

X_train, X_val, y_train, y_val = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

n_tap  = np.sum(y_train == 1)
n_walk = np.sum(y_train == 0)
total  = len(y_train)
class_weight = {
    0: total / (2 * n_walk),
    1: total / (2 * n_tap)
}

print(f"\n학습 데이터:")
print(f"  Train: {len(X_train)} | Val: {len(X_val)}")
print(f"  탭 비율: {y_train.mean():.1%}")
print(f"  class_weight: {class_weight}")

model = keras.Sequential([
    keras.layers.Input(shape=(WINDOW_SIZE, 2)),
    keras.layers.Conv1D(16, kernel_size=5, activation='relu', padding='same'),
    keras.layers.MaxPooling1D(2),
    keras.layers.Dropout(0.2),
    keras.layers.Conv1D(32, kernel_size=3, activation='relu', padding='same'),
    keras.layers.MaxPooling1D(2),
    keras.layers.Dropout(0.2),
    keras.layers.Flatten(),
    keras.layers.Dense(16, activation='relu'),
    keras.layers.Dropout(0.3),
    keras.layers.Dense(1, activation='sigmoid')
], name='SoleSignal_CNN_2ch')

model.summary()

model.compile(
    optimizer=keras.optimizers.Adam(learning_rate=0.001),
    loss='binary_crossentropy',
    metrics=['accuracy']
)

callbacks = [
    keras.callbacks.EarlyStopping(patience=15, restore_best_weights=True),
    keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=7, min_lr=1e-5)
]

print("\n학습중...")
history = model.fit(
    X_train, y_train,
    validation_data=(X_val, y_val),
    epochs=100,
    batch_size=16,
    class_weight=class_weight,
    callbacks=callbacks,
    verbose=1
)

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
ax1.plot(history.history['accuracy'],     label='Train')
ax1.plot(history.history['val_accuracy'], label='Val')
ax1.set_title('Accuracy')
ax1.set_xlabel('Epoch')
ax1.legend()
ax1.grid(True)
ax2.plot(history.history['loss'],     label='Train')
ax2.plot(history.history['val_loss'], label='Val')
ax2.set_title('Loss')
ax2.set_xlabel('Epoch')
ax2.legend()
ax2.grid(True)
plt.tight_layout()
plt.savefig('training_result.png', dpi=120)
print("\nSaved: training_result.png")

print("\nTFLite 변환중...")
model.save('solesignal_model.keras')

result = subprocess.run([
    sys.executable, '-c',
    '''
import tensorflow as tf
model = tf.keras.models.load_model('solesignal_model.keras')
func = tf.function(model).get_concrete_function(
    tf.TensorSpec(model.inputs[0].shape, model.inputs[0].dtype))
converter = tf.lite.TFLiteConverter.from_concrete_functions([func])
converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS]
tflite_model = converter.convert()
with open("solesignal_model.tflite", "wb") as f:
    f.write(tflite_model)
print("OK")
'''
], capture_output=True, text=True)

print(result.stdout)
if result.returncode != 0:
    print("STDERR:", result.stderr[-500:])

tflite_model = open('solesignal_model.tflite', 'rb').read()
size_kb = len(tflite_model) / 1024
print(f"  모델 크기: {size_kb:.1f} KB")

if size_kb < 100:
    print("  OK - nRF52840에 들어가는 크기")
else:
    print("  WARNING - 너무 큼, 레이어 줄이기 필요")

print("\nArduino 헤더 생성중...")
hex_str = ', '.join([f'0x{b:02x}' for b in tflite_model])

header = f"""// SoleSignal TFLite Model (A0 + A2, 2채널)
// Auto-generated by solesignal_train_2ch.py
// Model size: {size_kb:.1f} KB
// Window size: {WINDOW_SIZE}

#ifndef SOLESIGNAL_MODEL_H
#define SOLESIGNAL_MODEL_H

#include <stdint.h>

#define WINDOW_SIZE     {WINDOW_SIZE}
#define SOS_THRESHOLD   {SOS_THRESHOLD}f
#define VOTE_COUNT      3

#define SCALER_MIN_A0   {scaler_min_a0:.2f}f
#define SCALER_RANGE_A0 {scaler_range_a0:.2f}f
#define SCALER_MIN_A2   {scaler_min_a2:.2f}f
#define SCALER_RANGE_A2 {scaler_range_a2:.2f}f

const uint8_t solesignal_model[] = {{
  {hex_str}
}};

const int solesignal_model_len = {len(tflite_model)};

#endif // SOLESIGNAL_MODEL_H
"""

with open('solesignal_model.h', 'w') as f:
    f.write(header)

print("  Saved: solesignal_model.h")

val_loss, val_acc = model.evaluate(X_val, y_val, verbose=0)
print(f"\n{'='*40}")
print(f"완료!")
print(f"  Val accuracy: {val_acc:.1%}")
print(f"  모델 크기:    {size_kb:.1f} KB")
print(f"{'='*40}")