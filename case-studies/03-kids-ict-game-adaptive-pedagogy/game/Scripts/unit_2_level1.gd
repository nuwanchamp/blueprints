# =============================================================
#  Keyboard Skills Adventure with Pip
#  UNIT 2 — LEVEL 1 — "Meet the Keyboard"  (prototype)
#  Skill: none — orientation and motivation
#
#  PROTOTYPE NOTE: narration uses the recorded voice clips in
#  Assets/unit2-level1/, same audio-first pattern as Unit 1's
#  levels (see _say()) — no more text-to-speech fallback here.
#
#  MECHANIC (per Keyboard_Skills_Adventure_Level_Plan.md)
#  - Zig, the keyboard-bodied mascot from the Unit 2 intro video,
#    stands front and center.
#  - The first press of ANY key makes Zig bounce and light up,
#    and pops confetti.
#  - Ends automatically a couple of seconds later.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 1
const NEXT_SCENE := "res://Scenes/unit2-level2.tscn"   # placeholder — level 2 not built yet

const COL_BG   := Color("e0f7f4")   # fresh minty pastel — gives Unit 2 its own identity
const COL_TEXT := Color("2c6e68")

const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")
const ZIG_TEXTURE: Texture2D = preload("res://Assets/keyboard-mascot-nokeys-trans.png")
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

# --- Recorded narration clips ---
const VOICE_PRESS_ANY_KEY: AudioStream = preload("res://Assets/unit2-level1/press-any-key.mp3")
const VOICE_FOUND_KEY: AudioStream = preload("res://Assets/unit2-level1/found-a-key.mp3")

const ZIG_WIDTH := 720.0   # Zig's displayed width, in pixels

# Individual keycap regions, cropped at runtime from the fully-keyed
# reference art and laid on top of the blank ZIG_TEXTURE body — this is
# what lets a single key react on its own instead of Zig's whole body.
const ZIG_KEYS_ATLAS: Texture2D = preload("res://Assets/keyboard-mascot-empty.png")
const KEY_RECTS: Array[Rect2] = [
	Rect2(318, 226, 56, 61), Rect2(377, 228, 55, 62), Rect2(435, 230, 55, 61),
	Rect2(727, 240, 55, 61), Rect2(784, 242, 54, 60), Rect2(843, 244, 97, 61),
	Rect2(336, 293, 56, 61), Rect2(395, 296, 54, 59), Rect2(454, 298, 53, 59),
	Rect2(513, 299, 53, 59), Rect2(571, 302, 53, 59), Rect2(630, 303, 53, 59),
	Rect2(690, 303, 55, 61), Rect2(750, 305, 54, 60), Rect2(807, 306, 55, 61),
	Rect2(864, 308, 77, 60), Rect2(355, 357, 56, 60), Rect2(413, 358, 55, 61),
	Rect2(472, 361, 53, 59), Rect2(530, 363, 54, 58), Rect2(588, 365, 53, 58),
	Rect2(647, 365, 55, 60), Rect2(707, 368, 54, 58), Rect2(767, 370, 54, 58),
	Rect2(827, 370, 113, 60), Rect2(320, 419, 111, 61), Rect2(436, 423, 54, 58),
	Rect2(736, 424, 81, 73), Rect2(494, 425, 53, 58), Rect2(551, 425, 55, 60),
	Rect2(608, 428, 54, 58), Rect2(721, 429, 53, 60), Rect2(665, 430, 52, 57),
	Rect2(776, 431, 54, 60), Rect2(840, 440, 51, 55), Rect2(320, 482, 73, 60),
	Rect2(396, 484, 71, 60), Rect2(471, 487, 258, 64), Rect2(732, 493, 53, 58),
	Rect2(788, 497, 50, 55), Rect2(840, 498, 49, 56), Rect2(892, 499, 50, 55),
]

var _has_pressed := false
var _zig: Sprite2D
var _zig_base_scale := Vector2.ONE
var _key_sprites: Array[Sprite2D] = []
var _instruction_label: RichTextLabel
var _speaker_btn: Button
var _voice: AudioStreamPlayer   # plays the recorded narration clips
var _current_instruction := "Press any key and see what happens!"
var _current_clip: AudioStream = VOICE_PRESS_ANY_KEY


func _ready() -> void:
	StarChart.hide_chart()
	Input.set_custom_mouse_cursor(HAND_CURSOR)

	var bg := ColorRect.new()
	bg.color = COL_BG
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	bg_layer.add_child(bg)
	add_child(bg_layer)

	_build_zig()
	_build_ui()

	_voice = AudioStreamPlayer.new()
	add_child(_voice)

	_say(VOICE_PRESS_ANY_KEY, "Press any key and see what happens!")


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


# ----------------------------------------------------------------
#  Zig — the keyboard-bodied mascot from the Unit 2 intro video,
#  standing in for a plain drawn keyboard.
# ----------------------------------------------------------------
func _build_zig() -> void:
	_zig = Sprite2D.new()
	_zig.texture = ZIG_TEXTURE
	var scale_factor := ZIG_WIDTH / ZIG_TEXTURE.get_width()
	_zig_base_scale = Vector2.ONE * scale_factor
	_zig.scale = _zig_base_scale
	_zig.position = Vector2(_screen_size().x * 0.5, _screen_size().y * 0.58)
	add_child(_zig)

	# One Sprite2D per keycap, cropped from ZIG_KEYS_ATLAS and parented
	# under _zig so each key inherits its position/scale/rotation, but can
	# still be popped/flashed independently on top of that.
	var tex_size := ZIG_TEXTURE.get_size()
	for rect in KEY_RECTS:
		var atlas := AtlasTexture.new()
		atlas.atlas = ZIG_KEYS_ATLAS
		atlas.region = rect
		var key := Sprite2D.new()
		key.texture = atlas
		key.position = rect.get_center() - tex_size * 0.5
		_zig.add_child(key)
		_key_sprites.append(key)


## Zig's reaction to a key press: just one real individual key popping —
## the rest of the body stays put.
func _pulse_zig() -> void:
	_pulse_random_key()


func _pulse_random_key() -> void:
	if _key_sprites.is_empty():
		return
	var key := _key_sprites[randi() % _key_sprites.size()]

	var bounce := create_tween()
	bounce.tween_property(key, "scale", Vector2.ONE * 1.5, 0.12)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	bounce.tween_property(key, "scale", Vector2.ONE, 0.35)\
		.set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)

	var flash := create_tween()
	flash.tween_property(key, "modulate", Color(1.6, 1.6, 1.15), 0.1)
	flash.tween_property(key, "modulate", Color.WHITE, 0.35)


# ----------------------------------------------------------------
#  Any key press = success
# ----------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if _has_pressed or not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	_has_pressed = true
	_on_key_found()


func _on_key_found() -> void:
	_pulse_zig()
	Confetti.rain()
	_play_chime()
	_say(VOICE_FOUND_KEY, "You found a key!")
	get_tree().create_timer(2.5).timeout.connect(_on_celebration_finished)


func _on_celebration_finished() -> void:
	level_completed.emit(LEVEL_NUMBER)
	var err := get_tree().change_scene_to_file(NEXT_SCENE)
	if err != OK:
		## Level 2 doesn't exist yet in this prototype — stay put instead
		## of crashing, and let the child keep pressing keys.
		_has_pressed = false
		_say(VOICE_PRESS_ANY_KEY, "Press any key and see what happens!")


# ----------------------------------------------------------------
#  UI: one short text line + speaker button (same pattern as Unit 1)
# ----------------------------------------------------------------
func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)

	_instruction_label = RichTextLabel.new()
	_instruction_label.bbcode_enabled = true
	_instruction_label.fit_content = true
	_instruction_label.scroll_active = false
	_instruction_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_instruction_label.add_theme_font_override("normal_font", UI_FONT)
	_instruction_label.add_theme_font_size_override("normal_font_size", 34)
	_instruction_label.add_theme_color_override("font_outline_color", Color("1d4a46"))
	_instruction_label.add_theme_constant_override("outline_size", 10)
	_instruction_label.anchor_left = 0.05
	_instruction_label.anchor_right = 0.95
	_instruction_label.anchor_top = 0.1
	_instruction_label.anchor_bottom = 0.2
	layer.add_child(_instruction_label)

	_speaker_btn = Button.new()
	_speaker_btn.text = "🔊"
	_speaker_btn.add_theme_font_size_override("font_size", 30)
	_speaker_btn.anchor_left = 0.0
	_speaker_btn.anchor_top = 1.0
	_speaker_btn.offset_left = 16
	_speaker_btn.offset_top = -76
	_speaker_btn.offset_right = 76
	_speaker_btn.offset_bottom = -16
	_speaker_btn.pressed.connect(func () -> void: _say(_current_clip, _current_instruction))
	layer.add_child(_speaker_btn)


# ----------------------------------------------------------------
#  Narration: recorded voice clips (audio-first), text line synced
# ----------------------------------------------------------------
func _say(clip: AudioStream, text: String) -> void:
	_current_instruction = text
	_current_clip = clip
	_instruction_label.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ text
		+ "[/rainbow][/center]"
	)
	_voice.stop()               # never overlap two voice lines
	_voice.stream = clip
	_voice.play()


# ----------------------------------------------------------------
#  Chime (generated, zero assets — swap for a recording anytime)
# ----------------------------------------------------------------
func _play_chime() -> void:
	var player := AudioStreamPlayer.new()
	add_child(player)
	player.stream = _chime_wave()
	player.finished.connect(player.queue_free)
	player.play()


# Builds the "ta-da" chime as a real WAV buffer up front instead of
# feeding an AudioStreamGenerator live from the main thread — the
# live-push API contends with the audio mixer thread, and doing that
# for several chimes/voice lines at once (e.g. right after finishing
# a level, when this and StarChart's own chime can overlap) was able
# to hang the whole process.
func _chime_wave() -> AudioStreamWAV:
	var mix_rate := 22050
	var notes: Array[float] = [1046.5, 1568.0]   # C6 then G6
	var note_len := 0.25
	var frames_per_note := int(mix_rate * note_len)
	var data := PackedByteArray()
	data.resize(frames_per_note * notes.size() * 2)   # 16-bit mono
	var byte_idx := 0
	for freq in notes:
		for i in frames_per_note:
			var tt := float(i) / mix_rate
			var env := 1.0 - tt / note_len
			var v := sin(TAU * freq * tt) * 0.22 * env
			data.encode_s16(byte_idx, int(clampf(v, -1.0, 1.0) * 32767.0))
			byte_idx += 2
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = mix_rate
	wav.stereo = false
	wav.data = data
	return wav
