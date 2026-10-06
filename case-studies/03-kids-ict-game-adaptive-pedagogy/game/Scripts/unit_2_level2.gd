# =============================================================
#  Keyboard Skills Adventure with Pip
#  UNIT 2 — LEVEL 2 — "Light-Up Keys"  (prototype)
#  Skill: cause and effect — pressing a key does something
#
#  PROTOTYPE NOTE: narration uses the recorded voice clips in
#  Assets/unit2-level2/, same audio-first pattern as Level 1 (see
#  _say()). Zig (the keyboard-bodied mascot) stands in for a
#  plain drawn keyboard, same as Level 1.
#
#  MECHANIC (per Keyboard_Skills_Adventure_Level_Plan.md)
#  - Every key press lights up a random key on Zig's body and
#    pops a little confetti — no specific target, no wrong
#    answer, every press is its own reward.
#  - Ends after 15 presses or 90 seconds, whichever comes first.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 11   # StarChart badge slot (Unit 2 starts at 11)
const NEXT_SCENE := "res://Scenes/unit2-level3.tscn"   # placeholder — level 3 not built yet

const MAX_PRESSES := 15
const TIME_LIMIT_SECONDS := 90.0

const COL_BG   := Color("e0f7f4")   # same fresh minty pastel as level 1
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

# --- Recorded narration clips ---
const VOICE_KEY_IS_MAGIC: AudioStream = preload("res://Assets/unit2-level2/key-is-magic.mp3")
const VOICE_LIGHTING_UP: AudioStream = preload("res://Assets/unit2-level2/lighting-up.mp3")

const ZIG_TEXTURE: Texture2D = preload("res://Assets/keyboard-mascot-nokeys-trans.png")
const ZIG_WIDTH := 720.0   # Zig's displayed width, in pixels

# Individual keycap regions, cropped at runtime from the fully-keyed
# reference art and laid on top of the blank ZIG_TEXTURE body — same
# layout data as Level 1, so a single key can light up on its own.
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

var _presses := 0
var _finished := false
var _zig: Sprite2D
var _key_sprites: Array[Sprite2D] = []
var _instruction_label: RichTextLabel
var _speaker_btn: Button
var _voice: AudioStreamPlayer   # plays the recorded narration clips
var _current_instruction := "Press any key you like — watch it light up!"
var _current_clip: AudioStream = VOICE_KEY_IS_MAGIC


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

	_say(VOICE_KEY_IS_MAGIC, "Every key is magic! Press any button you like!")
	get_tree().create_timer(TIME_LIMIT_SECONDS).timeout.connect(_on_time_up)


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
	_zig.scale = Vector2.ONE * scale_factor
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


func _light_up_random_key() -> void:
	if _key_sprites.is_empty():
		return
	var key := _key_sprites[randi() % _key_sprites.size()]
	var colors: Array[Color] = [
		Color("ff6b6b"), Color("ffd166"), Color("06d6a0"), Color("6b7fd7"), Color("ff8fab"),
	]
	var flash: Color = colors[randi() % colors.size()]

	var t := create_tween()
	t.tween_property(key, "modulate", flash, 0.12)
	t.tween_interval(0.15)
	t.tween_property(key, "modulate", Color.WHITE, 0.3)

	var st := create_tween()
	st.tween_property(key, "scale", Vector2.ONE * 1.25, 0.12)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	st.tween_property(key, "scale", Vector2.ONE, 0.25)

	Confetti.rain(14, 0.25)


# ----------------------------------------------------------------
#  Every key press is a reward — no target, no wrong answer.
# ----------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if _finished or not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return

	_light_up_random_key()
	_play_pop()
	_presses += 1
	if _presses >= MAX_PRESSES:
		_on_level_finished()


func _on_time_up() -> void:
	if not _finished:
		_on_level_finished()


func _on_level_finished() -> void:
	_finished = true
	StarChart.show_chart(StarChart.UNIT_2_LEVELS)
	StarChart.add_star(LEVEL_NUMBER)
	_say(VOICE_LIGHTING_UP, "Wow, you're lighting up the whole keyboard!")
	get_tree().create_timer(2.5).timeout.connect(_on_celebration_finished)


func _on_celebration_finished() -> void:
	level_completed.emit(LEVEL_NUMBER)
	var err := get_tree().change_scene_to_file(NEXT_SCENE)
	if err != OK:
		# Level 3 doesn't exist yet in this prototype — stay put instead
		# of crashing, and let the child keep pressing keys.
		_finished = false
		_presses = 0
		_say(VOICE_KEY_IS_MAGIC, "Every key is magic! Press any button you like!")


# ----------------------------------------------------------------
#  UI: one short text line + speaker button (same pattern as level 1)
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
#  Pop (generated, zero assets — a light, repeatable reward sound,
#  distinct from level 1's bigger one-off chime)
# ----------------------------------------------------------------
func _play_pop() -> void:
	var player := AudioStreamPlayer.new()
	add_child(player)
	player.stream = _pop_wave(randf_range(700.0, 1100.0))
	player.finished.connect(player.queue_free)
	player.play()


# Builds the pop as a real WAV buffer up front instead of feeding an
# AudioStreamGenerator live from the main thread — the live-push API
# contends with the audio mixer thread, and several sounds/voice lines
# starting at once was able to hang the whole process.
func _pop_wave(freq: float) -> AudioStreamWAV:
	var mix_rate := 22050
	var dur := 0.09
	var frames := int(mix_rate * dur)
	var data := PackedByteArray()
	data.resize(frames * 2)   # 16-bit mono
	var byte_idx := 0
	for i in frames:
		var tt := float(i) / mix_rate
		var env := 1.0 - tt / dur
		var v := sin(TAU * freq * tt) * 0.2 * env
		data.encode_s16(byte_idx, int(clampf(v, -1.0, 1.0) * 32767.0))
		byte_idx += 2
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = mix_rate
	wav.stereo = false
	wav.data = data
	return wav
