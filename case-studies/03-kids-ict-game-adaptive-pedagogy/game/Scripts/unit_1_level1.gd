extends Node2D
@onready var audio = get_node("AudioStreamPlayer2D")
@onready var cheer = get_node("AudioStreamPlayer2D2")

var has_cheered: bool = false

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	StarChart.hide_chart()

	# Play the stream
	audio.play()

	# Change the mouse pointer
	Input.set_custom_mouse_cursor(preload("res://Assets/handmouse.png"))

# Fires automatically whenever there's mouse/keyboard input
func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and not has_cheered:
		var window_rect := get_viewport().get_visible_rect()
		if window_rect.has_point(event.position):
			has_cheered = true
			Confetti.rain()
			cheer.play()
			get_tree().create_timer(2.5).timeout.connect(_on_celebration_finished)


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)


func _on_celebration_finished() -> void:
	get_tree().change_scene_to_file("res://Scenes/unit1-level2.tscn")
