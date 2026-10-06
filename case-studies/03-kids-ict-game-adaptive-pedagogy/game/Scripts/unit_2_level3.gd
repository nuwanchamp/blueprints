# =============================================================
#  Keyboard Skills Adventure with Pip
#  UNIT 2 — LEVEL 3 — "Space Jump"  (prototype)
#  Skill: one big, easy key (the spacebar), pressed repeatedly
#
#  PROTOTYPE NOTE: narration uses the recorded voice clips in
#  Assets/unit2-level3/, same audio-first pattern as Levels 1–2
#  (see _say()). Zig (the keyboard-bodied mascot) stands in for
#  a plain drawn keyboard, same as Levels 1–2.
#
#  MECHANIC (per Keyboard_Skills_Adventure_Level_Plan.md)
#  - Zig stands in the centre; the spacebar (the longest key on
#    Zig's own body) pulses invitingly.
#  - Each SPACE press makes Zig jump — higher and sillier each
#    time — with a bouncy sound and the real spacebar key
#    lighting up.
#  - Other keys aren't wrong: a gentle nudge points the child
#    to the long key at the bottom. No fail states.
#  - After 10 jumps Zig lands with a happy wobble, confetti
#    rains, and the level ends.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 12   # StarChart badge slot (Unit 2 starts at 11)
const NEXT_SCENE := "res://Scenes/unit2-level4.tscn"   # placeholder — level 4 not built yet

const JUMPS_TO_WIN := 10
const IDLE_HINT_SECONDS := 8.0
const SPACEBAR_HINT_INTERVAL := 3.5   # how often the spacebar blinks, in seconds

const COL_BG   := Color("e0f7f4")   # same fresh minty pastel as levels 1–2
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

# --- Recorded narration clips ---
const VOICE_INTRO: AudioStream = preload("res://Assets/unit2-level3/watch-me-jump.mp3")
const VOICE_IDLE_HINT: AudioStream = preload("res://Assets/unit2-level3/longest-key.mp3")
const VOICE_ALMOST: AudioStream = preload("res://Assets/unit2-level3/almost-space-bar.mp3")
const VOICE_FINISH: AudioStream = preload("res://Assets/unit2-level3/what-a-jumper.mp3")
const VOICE_REPLAY: AudioStream = preload("res://Assets/unit2-level3/press-spacebar.mp3")

const ZIG_TEXTURE: Texture2D = preload("res://Assets/keyboard-mascot-nokeys-trans.png")
const ZIG_WIDTH := 720.0   # Zig's displayed width, in pixels

# Individual keycap regions, cropped at runtime from the fully-keyed
# reference art and laid on top of the blank ZIG_TEXTURE body — same
# layout data as Levels 1–2, so the real spacebar can be found and lit
# up on its own.
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

var _jumps := 0
var _finished := false
var _zig: Sprite2D
var _zig_home := Vector2.ZERO
var _zig_base_scale := Vector2.ONE
var _jump_tween: Tween
var _key_sprites: Array[Sprite2D] = []
var _spacebar_key: Sprite2D
var _spacebar_hint_timer: Timer
var _idle_timer: Timer
var _instruction_label: RichTextLabel
var _speaker_btn: Button
var _voice: AudioStreamPlayer   # plays the recorded narration clips
var _current_instruction := "Find the LONGEST key at the bottom and press it!"
var _current_clip: AudioStream = VOICE_IDLE_HINT


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

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)
	_idle_timer.start()

	_spacebar_hint_timer = Timer.new()
	_spacebar_hint_timer.wait_time = SPACEBAR_HINT_INTERVAL
	_spacebar_hint_timer.timeout.connect(_blink_spacebar_hint)
	add_child(_spacebar_hint_timer)
	_spacebar_hint_timer.start()

	_voice = AudioStreamPlayer.new()
	add_child(_voice)

	_say(VOICE_INTRO, "Find the LONGEST key at the bottom — that's the space bar! Press it and watch me jump!")


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


# ----------------------------------------------------------------
#  Zig — the keyboard-bodied mascot from the Unit 2 intro video,
#  standing in for a plain drawn keyboard. Zig itself is the one
#  who jumps on every spacebar press.
# ----------------------------------------------------------------
func _build_zig() -> void:
	_zig = Sprite2D.new()
	_zig.texture = ZIG_TEXTURE
	var scale_factor := ZIG_WIDTH / ZIG_TEXTURE.get_width()
	_zig_base_scale = Vector2.ONE * scale_factor
	_zig.scale = _zig_base_scale
	_zig_home = Vector2(_screen_size().x * 0.5, _screen_size().y * 0.58)
	_zig.position = _zig_home
	add_child(_zig)

	# One Sprite2D per keycap, cropped from ZIG_KEYS_ATLAS and parented
	# under _zig so each key inherits its position/scale/rotation — the
	# widest one is the real spacebar.
	var tex_size := ZIG_TEXTURE.get_size()
	var widest := 0.0
	for rect in KEY_RECTS:
		var atlas := AtlasTexture.new()
		atlas.atlas = ZIG_KEYS_ATLAS
		atlas.region = rect
		var key := Sprite2D.new()
		key.texture = atlas
		key.position = rect.get_center() - tex_size * 0.5
		_zig.add_child(key)
		_key_sprites.append(key)
		if rect.size.x > widest:
			widest = rect.size.x
			_spacebar_key = key



func _jump_zig() -> void:
	# Each jump is a bit higher and a bit sillier (more spin-wobble).
	var height := 60.0 + 14.0 * _jumps
	var wobble := deg_to_rad(minf(4.0 + 3.0 * _jumps, 30.0))
	if randf() < 0.5:
		wobble = -wobble

	if _jump_tween:
		_jump_tween.kill()
	_zig.position = _zig_home
	_zig.rotation = 0.0

	_jump_tween = create_tween()
	# Up: ease out, squash-and-stretch flavored with a little tilt.
	_jump_tween.tween_property(_zig, "position:y", _zig_home.y - height, 0.28)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_jump_tween.parallel().tween_property(_zig, "rotation", wobble, 0.28)
	# Down: gravity ease in, straighten out.
	_jump_tween.tween_property(_zig, "position:y", _zig_home.y, 0.3)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	_jump_tween.parallel().tween_property(_zig, "rotation", 0.0, 0.3)
	# Landing squash.
	_jump_tween.tween_property(_zig, "scale",
		Vector2(_zig_base_scale.x * 1.12, _zig_base_scale.y * 0.88), 0.08)
	_jump_tween.tween_property(_zig, "scale", _zig_base_scale, 0.12)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## A couple of quick blinks every SPACEBAR_HINT_INTERVAL seconds — a
## periodic nudge rather than a nonstop animation, so it stays noticeable
## without being distracting.
func _blink_spacebar_hint() -> void:
	if _finished:
		return
	var t := create_tween()
	for i in 2:
		t.tween_property(_spacebar_key, "modulate", Color(0.4, 0.4, 0.4), 0.06)
		t.tween_interval(0.12)
		t.tween_property(_spacebar_key, "modulate", Color.WHITE, 0.06)
		t.tween_interval(0.12)


func _flash_spacebar() -> void:
	_spacebar_key.modulate = Color("ffd166")
	var t := create_tween()
	t.tween_property(_spacebar_key, "modulate", Color.WHITE, 0.35)

	var st := create_tween()
	st.tween_property(_spacebar_key, "scale", Vector2(1.06, 1.2), 0.1)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	st.tween_property(_spacebar_key, "scale", Vector2.ONE, 0.2)


# ----------------------------------------------------------------
#  Input: SPACE jumps; other keys get a gentle pointer, never a fail.
# ----------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if _finished or not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	_idle_timer.start()

	if key.keycode == KEY_SPACE:
		_jumps += 1
		_flash_spacebar()
		_jump_zig()
		_play_boing()
		if _jumps >= JUMPS_TO_WIN:
			_on_level_finished()
	else:
		_say(VOICE_ALMOST, "Almost! The space bar is the LONG key at the very bottom!")


func _on_idle_hint() -> void:
	if _finished:
		return
	_say(VOICE_IDLE_HINT, "Find the LONGEST key at the bottom and press it!")
	_flash_spacebar()
	_idle_timer.start()


func _on_level_finished() -> void:
	_finished = true
	_idle_timer.stop()
	_spacebar_hint_timer.stop()
	Confetti.rain()
	StarChart.show_chart(StarChart.UNIT_2_LEVELS)
	StarChart.add_star(LEVEL_NUMBER)
	_say(VOICE_FINISH, "Wow, what a jumper! You mastered the space bar!")
	get_tree().create_timer(2.5).timeout.connect(_on_celebration_finished)


func _on_celebration_finished() -> void:
	level_completed.emit(LEVEL_NUMBER)
	var err := get_tree().change_scene_to_file(NEXT_SCENE)
	if err != OK:
		# Level 4 doesn't exist yet in this prototype — stay put instead
		# of crashing, and let the child keep jumping.
		_finished = false
		_jumps = 0
		_idle_timer.start()
		_spacebar_hint_timer.start()
		_say(VOICE_REPLAY, "Press the space bar and watch me jump!")


# ----------------------------------------------------------------
#  UI: one short text line + speaker button (same pattern as 1–2)
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
#  Boing (generated, zero assets) — pitch rises with each jump so
#  the escalation is audible as well as visible.
# ----------------------------------------------------------------
func _play_boing() -> void:
	var player := AudioStreamPlayer.new()
	add_child(player)
	player.stream = _boing_wave(350.0 + 30.0 * _jumps)
	player.finished.connect(player.queue_free)
	player.play()


# Builds the "boing" as a real WAV buffer up front instead of feeding an
# AudioStreamGenerator live from the main thread — the live-push API
# contends with the audio mixer thread, and several sounds/voice lines
# starting at once was able to hang the whole process.
func _boing_wave(base: float) -> AudioStreamWAV:
	var mix_rate := 22050
	var dur := 0.22
	var frames := int(mix_rate * dur)
	var data := PackedByteArray()
	data.resize(frames * 2)   # 16-bit mono
	var byte_idx := 0
	for i in frames:
		var tt := float(i) / mix_rate
		var k := tt / dur
		var freq := lerpf(base, base * 2.4, k)   # rising sweep = "boing"
		var env := 1.0 - k
		var v := sin(TAU * freq * tt) * 0.24 * env
		data.encode_s16(byte_idx, int(clampf(v, -1.0, 1.0) * 32767.0))
		byte_idx += 2
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = mix_rate
	wav.stereo = false
	wav.data = data
	return wav
